'use strict';

const animate = { frequencies: new Float32Array(301),
    filter: new Map(), compr: new Map(), analy: new Map() };
const ui = (() => {
    let graph = document.getElementById('graph');
    let container = graph.firstElementChild;
    return {
        graph: graph,
        container: container,
        svg: container.firstElementChild,
        menu: document.getElementById('menu'),
        param: document.getElementById('param'),
        movedata: {},
    };
})();

ui.measure = function(skip) {
    let size = [Infinity, Infinity, -Infinity, -Infinity];
    for (let node of ui.container.children) {
        if (node == ui.svg || node == skip)
            continue;
        if (node.offsetLeft - 8 < size[0])
            size[0] = node.offsetLeft - 8;
        if (node.offsetTop - 8 < size[1])
            size[1] = node.offsetTop - 8;
        if (node.offsetLeft + node.offsetWidth + 5 > size[2])
            size[2] = node.offsetLeft + node.offsetWidth + 5;
        if (node.offsetTop + node.offsetHeight + 5 > size[3])
            size[3] = node.offsetTop + node.offsetHeight + 5;
    }
    size[0] -= ui.container.offsetLeft;
    size[1] -= ui.container.offsetTop;
    size[2] -= ui.container.offsetLeft;
    size[3] -= ui.container.offsetTop;
    return size;
};

ui.resize = function(left, top, right, bottom) {
    let origin = [
        ui.graph.scrollLeft - ui.container.offsetLeft + ui.graph.offsetLeft,
        ui.graph.scrollTop - ui.container.offsetTop,
    ];
    if (left > origin[0])
        left = origin[0];
    if (top > origin[1])
        top = origin[1];
    if (right < origin[0] + graph.clientWidth)
        right = origin[0] + graph.clientWidth;
    if (bottom < origin[1] + graph.clientHeight)
        bottom = origin[1] + graph.clientHeight;
    
    ui.container.style.marginLeft = -left + 'px';
    ui.container.style.marginTop = -top + 'px';
    ui.svg.style.marginLeft = left + 'px';
    ui.svg.style.marginTop = top + 'px';
    ui.svg.style.width = right - left + 'px';
    ui.svg.style.height = bottom - top + 'px';
    ui.svg.setAttribute('viewBox', [left, top, right - left, bottom - top].join(' '));
    ui.graph.scrollTo(origin[0] - left, origin[1] - top);
};

ui.drag = function(event) {
    let left = ui.movedata.x + event.clientX, top = ui.movedata.y + event.clientY;
    if (!ui.movedata.elt.style.position) {
        ui.resize(Math.min(ui.movedata.size[0], left - 8), Math.min(ui.movedata.size[1], top - 8),
            Math.max(ui.movedata.size[2], left + ui.movedata.elt.offsetWidth + 5),
            Math.max(ui.movedata.size[3], top + ui.movedata.elt.offsetHeight + 5));
    }
    
    ui.movedata.elt.style.marginLeft = left + 'px';
    ui.movedata.elt.style.marginTop = top + 'px';
    ui.movedata.paths.forEach(path => path.redraw());
};

ui.connect = function(event) {
    Connection.draw(ui.movedata.paths, ui.movedata.x, ui.movedata.y,
        event.clientX + ui.graph.scrollLeft - ui.container.offsetLeft,
        event.clientY + ui.graph.scrollTop - ui.container.offsetTop);
}

ui.try_connect = function(event) {
    if (event.target.nodeName.toLowerCase() != 'img' || event.target.dataset.type) return false;

    const isStart = elt =>
        (elt.parentNode.className == 'multiple' ? elt.parentNode : elt).previousElementSibling;
    let start, end;
    if (isStart(ui.movedata.elt))
        start = ui.movedata.elt;
    else
        end = ui.movedata.elt;
    if (isStart(event.target))
        start = event.target;
    else
        end = event.target;
    if (!start || !end) return false;
    
    let last = ui.svg.children.length - 2;
    for (let i = 1; i < last; i += 2) {
        let data = core.eltdata.get(ui.svg.children[i]);
        if (data.start == start && data.end == end) return false;
    }
    new Connection(start, end, ui.movedata.paths);
    return true;
}

ui.menu_click = function(event) {
    switch (event.target.dataset.type) {
    case 'save':
        let save = new Blob([JSON.stringify(core.save())], { type: 'application/octet-stream' });
        open(URL.createObjectURL(save));
        break;
    case 'load':
        let file = document.createElement('input');
        file.type = 'file';
        file.oninput = () => {
            core.clear();
            file.files[0].text().then(text => core.load(JSON.parse(text)));
        }
        file.click();
        break;
    case 'reset':
        core.clear();
        let node = new Node('dest');
        ui.container.appendChild(node.elt);
        node.elt.style.marginTop = '10px';
        node.elt.style.marginLeft = ui.graph.clientWidth - node.elt.offsetWidth - 15 + 'px';
        ui.resize(...ui.measure());
        break;
    case 'buf':
        let html = ['<div>Audio Buffers<img src="icons.svg#close" data-type="close" /></div>'];
        for (let buf of dialog.buffers)
            html.push('<div>', buf.name, '<img src="icons.svg#delete" data-type="delete" />',
                '<img src="icons.svg#copy" data-type="copy" />',
                '<img src="icons.svg#edit" data-type="edit" /></div>');
        
        html.push('<div><input type="button" value="Raw data" data-type="raw" />',
            '<input type="button" value="Import file" data-type="file" />',
            '<input type="button" value="Close" data-type="close" /></div>');
        
        dialog.elt.innerHTML = html.join('');
        dialog.style.display = 'flex';
        dialog.data = { type: 'buffer' };
        break;
    }
};

ui.node_new = function(event) {
    if (!event.target.dataset.node) return;
    let node = new Node(event.target.dataset.node);

    let offset = [
        ui.container.offsetLeft + node.elt.offsetWidth / 2,
        ui.container.offsetTop + node.elt.offsetHeight / 2,
    ];
    
    node.elt.style.marginLeft = event.clientX - offset[0] + 'px';
    node.elt.style.marginTop = event.clientY - offset[1] + 'px';
    node.elt.style.position = 'absolute';

    ui.movedata = {
        elt: node.elt,
        paths: new Set(),
        x: -offset[0],
        y: -offset[1],
    };
    
    document.addEventListener('mousemove', ui.drag);
    document.addEventListener('mouseup', e => {
        node.elt.style.marginTop =
            node.elt.offsetTop + ui.graph.scrollTop - ui.container.offsetTop + 'px';
        node.elt.style.marginLeft = (node.elt.offsetLeft < ui.container.offsetLeft ?
            ui.graph.scrollLeft + 10 :
            node.elt.offsetLeft + ui.graph.scrollLeft - ui.container.offsetLeft
        ) + 'px';
        node.elt.style.position = null;
        ui.resize(...ui.measure());
        document.removeEventListener('mousemove', ui.drag);
    }, { once: true });
};

ui.node_drag = function(event) {
    let elt = event.target;
    if (elt == ui.graph || elt == ui.container || elt.dataset.type) {
        event.preventDefault();
        return;
    }
    let tag = elt.nodeName.toLowerCase();
    if (tag == 'input' || tag == 'select'  || tag == 'path') return;
    event.preventDefault();
    
    if (tag == 'img') {
        let line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        let clickable = line.cloneNode();
        ui.svg.appendChild(line);
        ui.svg.appendChild(clickable);
        ui.container.className = 'connect';
        ui.movedata = {
            elt: elt,
            paths: [line, clickable],
            x: elt.offsetLeft + elt.offsetWidth / 2 - ui.container.offsetLeft,
            y: elt.offsetTop + elt.offsetHeight / 2 - ui.container.offsetTop,
        };
        document.addEventListener('mousemove', ui.connect);
        document.addEventListener('mouseup', e => {
            document.removeEventListener('mousemove', ui.connect);
            ui.container.className = '';
            if (!ui.try_connect(e))
                ui.movedata.paths.forEach(p => ui.svg.removeChild(p));
        }, { once: true });
    } else {
        while (elt.nodeName.toLowerCase() != 'fieldset') elt = elt.parentNode;
        let paths = core.eltdata.get(elt).paths
        ui.movedata = {
            elt: elt, size: ui.measure(elt), paths: paths,
            x: elt.offsetLeft - event.clientX - ui.container.offsetLeft,
            y: elt.offsetTop - event.clientY - ui.container.offsetTop,
        };
        document.addEventListener('mousemove', ui.drag);
        document.addEventListener('mouseup', e => {
            document.removeEventListener('mousemove', ui.drag);
        }, { once: true });
    }
};

ui.node_click = function(event) {
    switch (event.target.nodeName.toLowerCase()) {
    case 'path':
        core.eltdata.get(event.target).delete();
        break;
    case 'img':
        let elt = event.target.parentNode.parentNode;
        let data = core.eltdata.get(elt);
        switch (event.target.dataset.type) {
        case 'start':
            if (data.node instanceof AudioBufferSourceNode)
                data.node.buffer = data.settings[0].buffer;
            data.node.start();
            event.target.src = event.target.src.replace(/#.*$/, '#stop');
            event.target.dataset.type = 'stop';
            break;
        case 'stop':
            data.node.stop();
            break;
        case 'suspend':
            core.audioctx.suspend();
            event.target.src = event.target.src.replace(/#.*$/, '#play');
            event.target.dataset.type = 'resume';
            break;
        case 'resume':
            core.audioctx.resume();
            event.target.src = event.target.src.replace(/#.*$/, '#pause');
            event.target.dataset.type = 'suspend';
            break;
        case 'recstart':
            if (!data.settings[2])
                data.apply();
            data.settings[2].start();
            event.target.src = event.target.src.replace(/#.*$/, '#stop');
            event.target.dataset.type = 'recstop';
            let prev = event.target.previousElementSibling;
            prev.src = prev.src.replace(/#.*$/, '#pause');
            prev.dataset.type = 'recpause';
            break;
        case 'recstop':
            data.settings[2].stop();
            break;
        case 'recpause':
            data.settings[2].pause();
            event.target.src = event.target.src.replace(/#.*$/, '#play');
            event.target.dataset.type = 'recplay';
            break;
        case 'recplay':
            data.settings[2].resume();
            event.target.src = event.target.src.replace(/#.*$/, '#pause');
            event.target.dataset.type = 'recpause';
            break;
        case 'delete':
            data.delete();
            break;
        case 'settings':
            dialog.make(
                data.desc.name + ' ' + elt.firstElementChild.firstElementChild.value,
                data.desc.settings.elements,
                data.settings,
            );
            dialog.data = { type: 'settings', data: data };
            break;
        case 'info':
            if (data.desc.info) {
                dialog.help(data.desc.info);
            } else {
                let name = data.node.constructor.name;
                if (data.desc.name == 'MediaStreamSource')
                    name = 'MediaStreamAudioSourceNode';
                let url = 'https://developer.mozilla.org/en-US/docs/Web/API/' + name;
                let text = document.createElement('p');
                text.textContent = 'loading...';
                data.desc.info = { name: name, url: url, text: text };
                dialog.help(data.desc.info);
                
                let xhr = new XMLHttpRequest();
                xhr.onload = () => {
                    data.desc.info.text = xhr.response.querySelector('.main-page-content > div > :not(:empty)');
                    data.desc.info.style = xhr.response.querySelector('link[rel="stylesheet"]');
                    dialog.help(data.desc.info);
                };
                xhr.onerror = () => data.desc.info.text.textContent = 'Failed to load ' + url;
                xhr.open('GET', 'https://api.allorigins.win/raw?url=' + url);
                xhr.responseType = 'document';
                xhr.send();
            }
            break;
        }
        break;
    }
};

ui.node_input = function(event) {
    let tag = event.target.nodeName.toLowerCase();
    if (tag != 'input' && tag != 'select') return;
    let elt = event.target.parentNode.parentNode;
    if (elt.nodeName.toLowerCase() == 'fieldset') {
        let name = event.target.value;
        if (name == elt.dataset.name)
            event.target.style.borderColor = null;
        else if (core.elements.has(name))
            event.target.style.borderColor = '#f00';
        else {
            event.target.style.borderColor = null;
            core.elements.set(name, core.elements.get(elt.dataset.name));
            core.elements.delete(elt.dataset.name);
            elt.dataset.name = name;
        }
        return;
    }
    let param = elt.dataset.param;
    let node = core.eltdata.get(elt.parentNode).node;
    if (node[param] instanceof AudioParam)
        node[param].setValueAtTime(event.target.value, 0);
    else if (event.target.type == 'checkbox')
        node[param] = event.target.checked;
    else
        node[param] = event.target.value;
};

ui.draw_frame = function() {
    requestAnimationFrame(ui.draw_frame);
    
    for (let [node, data] of animate.filter.entries()) {
        node.getFrequencyResponse(animate.frequencies, data[3].magn, data[3].phase);
        if (data[0]) {
            let path = ['M'];
            for (let i = 0; i < animate.frequencies.length; i++)
                path.push(i, 150 - 75 * data[3].magn[i]);
            data[4][0].firstElementChild.setAttribute('d', path.join(' '));
        }
        if (data[1]) {
            let path = ['M'];
            for (let i = 0; i < animate.frequencies.length; i++)
                path.push(i, 75 - 20 * Math.log(data[3].magn[i]));
            data[4][1].firstElementChild.setAttribute('d', path.join(' '));
        }
        if (data[2]) {
            let path = ['M'];
            for (let i = 0; i <= animate.frequencies.length; i++)
                path.push(i, 75 - data[3].phase[i] * 75 / Math.PI);
            data[4][2].firstElementChild.setAttribute('d', path.join(' '));
        }
    }

    for (let [node, data] of animate.compr.entries()) {
        data[1].firstElementChild.firstElementChild.value = node.reduction + " dB";
    }

    for (let [node, data] of animate.analy.entries()) {
        if (data[0]) {
            node.getByteFrequencyData(data[2].freq);
            let path = ['M'];
            for (let i = 0; i < node.frequencyBinCount; i++)
                path.push(i * 300 / node.frequencyBinCount, 150 - data[2].freq[i] * 150 / 255);
            data[3][0].firstElementChild.setAttribute('d', path.join(' '));
        }
        if (data[1]) {
            node.getByteTimeDomainData(data[2].time);
            let path = ['M'];
            for (let i = 0; i < node.fftSize; i++)
                path.push(i * 300 / node.fftSize, 150 - data[2].time[i] * 150 / 255);
            data[3][1].firstElementChild.setAttribute('d', path.join(' '));
        }
    }
};

ui.param_click = function(event) {
    switch (event.target.nodeName.toLowerCase()) {
    case 'button':
        new Param();
        break;
    case 'img':
        let elt = event.target.parentNode.parentNode;
        switch (event.target.dataset.type) {
        case 'start':
            let bps = 60 / event.target.previousElementSibling.previousElementSibling.value;
            let start = core.audioctx.currentTime;
            for (let elt of ui.param.children) {
                if (elt.nodeName.toLowerCase() != 'svg') continue;
                core.eltdata.get(elt).start(start, bps);
            }
            break;
        case 'stop':
            for (let elt of ui.param.children) {
                if (elt.nodeName.toLowerCase() != 'svg') continue;
                let names = elt.previousElementSibling.children;
                let data = core.elements.get(names[0].value);
                if (!data || !names[1].value) continue;
                data.node[names[1].value].cancelScheduledValues(0);
            }
            break;
        case 'delete':
            ui.param.removeChild(event.target.parentNode.nextElementSibling);
            ui.param.removeChild(event.target.parentNode);
            break;
        }
        break;
    case 'svg':
        let param = core.eltdata.get(event.target);
        let types = ['value', 'linear', 'exponential', 'target'];
        let html = ['<div>Audio Timeline<img src="icons.svg#close" data-type="close" /></div>'];
        for (let p of param.points) {
            html.push('<div><input type="number" step="any" value="', p[0],
                '" required class="small">: <select>');
            for (let t of types)
                html.push(t == p[1] ? '<option selected>' : '<option>', t, '</option>');
            html.push('</select> to <input type="number" step="any" value="', p[2],'" required>',
                '<input type="number" step="any" value="', p[3], '" class="small">',
                '<img src="icons.svg#delete" data-type="delete" /></div>');
        }
        html.push('<div><input type="button" value="Add point" data-type="new" />',
            '<input type="submit" value="Apply">',
            '<input type="button" value="Cancel" data-type="close"></div>');
        
        dialog.elt.innerHTML = html.join('');
        dialog.style.display = 'flex';
        dialog.data = { type: 'param', param: param };
        break;
    }
};

ui.param_focus = function(event) {
    if (event.target.nodeName.toLowerCase() != 'select') return;
    if (event.target.nextElementSibling.nodeName.toLowerCase() != 'select') return;
    let value = event.target.value;
    let html = [];
    for (let e of core.elements.keys())
        html.push(e == value ? '<option selected>' : '<option>', e, '</option>');
    event.target.innerHTML = html.join('');
};

ui.param_input = function(event) {
    if (event.target.nodeName.toLowerCase() != 'select') return;
    let next = event.target.nextElementSibling;
    if (next.nodeName.toLowerCase() != 'select') return;
    let data = core.elements.get(event.target.value);
    let html = ['<option hidden>Choose param</option>'];
    for (let p in data.desc.audioparams) html.push('<option>', p, '</option>');
    next.innerHTML = html.join('');
};

ui.menu.addEventListener('mousedown', ui.node_new);
ui.menu.addEventListener('click', ui.menu_click);
ui.graph.addEventListener('mousedown', ui.node_drag);
ui.graph.addEventListener('click', ui.node_click);
ui.graph.addEventListener('input', ui.node_input);
ui.param.addEventListener('click', ui.param_click);
ui.param.addEventListener('focusin', ui.param_focus);
ui.param.addEventListener('input', ui.param_input);
window.addEventListener('beforeunload',
    () => localStorage.setItem('webaudio_save', JSON.stringify(core.save())));

(function init() {
    let step = (Math.log(20000) - Math.log(20)) / (animate.frequencies.length - 1);
    for (let i = 0; i < animate.frequencies.length; i++)
        animate.frequencies[i] = 20 * Math.exp(i * step);
    let save = localStorage.getItem('webaudio_save');
    if (save) {
        core.load(JSON.parse(save));
    } else {
        let node = new Node('dest');
        ui.container.appendChild(node.elt);
        node.elt.style.marginTop = '10px';
        node.elt.style.marginLeft = ui.graph.clientWidth - node.elt.offsetWidth - 15 + 'px';
        ui.resize(...ui.measure());
    }
    ui.draw_frame();
})();
