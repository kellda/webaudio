'use strict';

/* Global variables *******************************************************************************/
let audioctx = new (AudioContext || webkitAudioContext)();
let graph = document.getElementById('graph');
let container = graph.firstElementChild, graphsvg = container.firstElementChild;
let param = document.getElementById('param');
let dialog = document.getElementById('dialog');
let mdninfo = document.getElementById('mdninfo');
let eltdata = new WeakMap(), graphsize, buffers = [];
let movedata, dialogdata, elements = new Map();
let animate = { filter: new Map(), compr: new Map(), analy: new Map() };
let frequencies = new Float32Array(301);

/* Settings modal dialog **************************************************************************/
function dialog_make(name, elements, settings) {
    let html = ['<div>', name, '<img src="icons.svg#close" data-type="close" /></div>'];
    for (let i in elements) {
        html.push('<label>', elements[i].label, ': ');
        switch (elements[i].type) {
        case 'mediastream':
            html.push('<select required></select>');
            navigator.mediaDevices.enumerateDevices().then(devices => {
                let html = [];
                for (let d of devices)
                    if(d.kind == 'audioinput')
                        html.push('<option value="', d.deviceId, '"',
                        settings[i].id == d.deviceId ? ' selected' : '',
                        '>', d.label, '</option>');
                dialog.firstElementChild.children[1].lastElementChild.innerHTML = html.join('');
            })
            break;
        case 'buffer':
            html.push('<select><option value="null">(none)</option>');
            for (let b in buffers)
                html.push('<option value="', b, '"',
                    settings[i] == buffers[b] ? ' selected' : '',
                    '>', buffers[b].name, '</option>');
            html.push('<option value="raw">From raw data</option>',
                '<option value="file">From file</option></select>');
            break;
        case 'textarea':
            html.push('<textarea>', settings[i], '</textarea>');
            break;
        case 'checkbox':
            html.push('<input type="checkbox"', settings[i] ? ' checked' : '', ' />');
            break;
        case 'number':
            html.push('<input type="number" step="any" min="', elements[i].min,
                '" max="', elements[i].max, '" value="', settings[i], '"',
                elements[i].optional ? '' : ' required', ' />');
            break;
        case 'file':
            html.push('<input type="', elements[i].type, '" accept="audio/*" required />');
            break;
        default:
            html.push('<input type="', elements[i].type, '" value="', settings[i], '"',
                elements[i].optional ? '' : ' required', ' />');
            break;
        }
        html.push('</label>');
    }
    html.push('<div><input type="submit" value="Apply"/>',
        '<input type="button" value="Cancel" data-type="close" /></div>');
    dialog.firstElementChild.innerHTML = html.join('');
    dialog.style.display = 'flex';
}

dialog.firstElementChild.addEventListener('submit', function dialog_submit(event) {
    event.preventDefault();
    if (dialogdata.type == 'param') {
        let elts = dialog.firstElementChild.children;
        let points = [];
        let range = [-Infinity, Infinity, -Infinity];
        for (let elt of elts) {
            if (elt.firstElementChild.type != 'number') continue;
            let point = [+elt.children[0].value, elt.children[1].value, +elt.children[2].value,
                +elt.children[3].value];
            if (point[0] > range[0]) range[0] = point[0];
            if (point[2] < range[1]) range[1] = point[2];
            if (point[2] > range[2]) range[2] = point[2];
            points.push(point);
        }
        points.sort((a, b) => a[0] - b[0]);
        dialogdata.data.points = points;
        dialogdata.data.range = range;
        param_draw(dialogdata.elt, dialogdata.data);
        dialog.style.display = 'none';
        return;
    }
    let elements = dialogdata.data.desc.settings.elements;
    let settings = dialogdata.data.settings;
    let labels = dialog.firstElementChild.children;
    let nextdialog = null;
    for (let i in elements) {
        switch (elements[i].type) {
        case 'mediastream':
            settings[i].id = labels[+i+1].lastElementChild.value;
            if (settings[i].stream)
                settings[i].stream.getTracks().forEach(t => t.stop());
            navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: settings[i].id }}})
                .then(stream => {
                    settings[i].stream = stream;
                    node_reload(dialogdata.data, [stream], false);
                });
            break;
        case 'buffer':
            if (settings[i] && settings[i].used)
                settings[i].used.delete(dialogdata.elt);
            let value = labels[+i+1].lastElementChild.value;
            switch (value) {
            case 'raw':
            case 'file':
                let desc = nodes['buffer_' + value];
                dialog_make('New Audio Buffer', desc.settings.elements, []);
                nextdialog = {
                    type: 'buffer',
                    data: { desc: desc, settings: [] },
                    elt: dialogdata.elt,
                };
                settings[i] = { buffer: null, type: 'new' };
                break;
            case 'null':
                settings[i] = { buffer: null, type: 'none' };
                break;
            default:
                settings[i] = buffers[value];
                buffers[value].used.add(dialogdata.elt);
                break;
            }
            break;
        case 'file':
            settings[i] = labels[+i+1].lastElementChild.files[0];
            break;
        case 'checkbox':
            settings[i] = labels[+i+1].lastElementChild.checked;
            break;
        default:
            settings[i] = labels[+i+1].lastElementChild.value;
            break;
        }
    }
    switch (dialogdata.type) {
    case 'settings':
        let args = dialogdata.data.desc.settings.apply(dialogdata.elt,
            dialogdata.data.node, dialogdata.data.settings);
        if (args)
            node_reload(dialogdata.data, args,
                dialogdata.elt.children[1].firstElementChild.dataset.type == 'stop');
        break;
    case 'buffer':
        let buffer = dialogdata.data.desc.settings.make(audioctx, dialogdata.data.settings);
        let data = { name: settings[0], buffer: null, type: 'loading', used: new Set() };
        if (dialogdata.elt) {
            let dataelt = eltdata.get(dialogdata.elt);
            if (dataelt.settings[0] && dataelt.settings[0].used)
                dataelt.settings[0].used.delete(dialogdata.elt);
            dataelt.settings[0] = data;
            data.used.add(dialogdata.elt);
            dataelt.desc.settings.apply(dialogdata.elt, dataelt.node, dataelt.settings);
        }
        buffer.then(buffer => {
            data.buffer = buffer;
            data.type = 'loaded';
            for (let use of data.used) {
                let usedata = eltdata.get(use);
                let args = usedata.desc.settings.apply(use, usedata.node, usedata.settings);
                if (args)
                    node_reload(usedata, args);
            }
        });
        if (dialogdata.id != undefined) {
            data.used = buffers[dialogdata.id].used;
            for (let use of data.used) {
                let usedata = eltdata.get(use);
                usedata.settings[0] = data;
                let args = usedata.desc.settings.apply(use, usedata.node, usedata.settings);
                if (args)
                    node_reload(usedata, args);
            }
            buffers[dialogdata.id] = data;
        } else
            buffers.push(data);
        break;
    }
    if(nextdialog)
        dialogdata = nextdialog;
    else
        dialog.style.display = 'none';
});

dialog.firstElementChild.addEventListener('click', function dialog_click(event) {
    let elt = event.target.parentNode;
    let index = Array.prototype.indexOf.call(elt.parentNode.children, elt) - 1;
    switch (event.target.dataset.type) {
    case 'close':
        dialog.style.display = 'none';
        break;
    case 'edit':
        let channels = [], buffer = buffers[index].buffer;
        for (let i = 0; i < buffer.numberOfChannels; i++)
            channels.push(buffer.getChannelData(i).join(','));
        let settings = [buffers[index].name, channels.join('\n'), buffer.sampleRate];
        dialog_make('Edit Audio Buffer', nodes.buffer_raw.settings.elements, settings);
        dialogdata = {
            type: 'buffer',
            data: { desc: nodes.buffer_raw, settings: settings },
            id: index
        };
        break;
    case 'new':
        let types = ['value', 'linear', 'exponential', 'target'];
        let point = document.createElement('div');
        let html = ['<input type="number" step="any" required class="small">: <select>'];
        for (let t of types)
            html.push('<option>', t, '</option>');
        html.push('</select> to <input type="number" step="any" required>',
            '<input type="number" step="any" class="small">',
            '<img src="icons.svg#delete" data-type="delete" />');
        point.innerHTML = html.join('');
        elt.parentNode.insertBefore(point, elt);
        break;
    case 'copy':
        buffers.push({ ...buffers[index], used: new Set() });
        elt.parentNode.insertBefore(elt.cloneNode(true), elt.parentNode.lastElementChild);
        break;
    case 'delete':
        switch (dialogdata.type) {
        case 'buffer':
            for (let use of buffers[index].used) {
                let data = eltdata.get(use);
                data.settings[0] = { buffer: null, type: 'none' };
                data.desc.settings.apply(use, data.node, data.settings);
            }
            buffers.splice(index, 1);
            elt.parentNode.removeChild(elt);
            break;
        case 'param':
            elt.parentNode.removeChild(elt);
            break;
        }
        break;
    case 'raw':
    case 'file':
        let desc = nodes['buffer_' + event.target.dataset.type];
        dialog_make('New Audio Buffer', desc.settings.elements, []);
        dialogdata = { type: 'buffer', data: { desc: desc, settings: [] } };
        break;
    }
});

/* Info from MDN **********************************************************************************/
function mdninfo_show(info) {
    if (info.style) {
        let head = mdninfo.contentDocument.head;
        info.style.onload = () => {
            if (head.children[1] != info.style)
                head.removeChild(head.children[1]);
        }
        head.insertBefore(info.style, head.lastElementChild);
    }
    let article = mdninfo.contentDocument.body.firstElementChild;
    article.children[0].firstChild.replaceWith(info.name);
    article.children[1].replaceWith(info.text);
    article.children[2].firstElementChild.href = info.url;
    article.children[3].firstElementChild.textContent = info.name;
    article.children[3].firstElementChild.href = info.url;
    article.children[3].children[1].href = info.url + '/contributors.txt';
    mdninfo.style.display = 'block';
}

/* Connections between nodes **********************************************************************/
function connect(start, startnode, end, endnode, disconnect) {
    let fn = disconnect ? 'disconnect' : 'connect', startidx = 0;
    if (start.parentNode.className == 'multiple') {
        startidx = Array.prototype.indexOf.call(start.parentNode.children, start);
        if (startidx >= startnode.numberOfOutputs)
            return false;
    }
    if (endnode == audioctx.listener)
        endnode = audioctx.destination;
    if (end.parentNode.className == 'multiple') {
        let endidx = Array.prototype.indexOf.call(end.parentNode.children, end);
        if (endidx >= endnode.numberOfInputs)
            return false;
        startnode[fn](endnode, startidx, endidx);
    } else {
        let endparam = end.parentNode.dataset.param;
        startnode[fn](endparam ? endnode[endparam] : endnode, startidx);
    }
    return true;
}

function connection_draw(paths, x1, y1, x2, y2) {
    let d = `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;
    paths.forEach(p => p.setAttribute('d', d));
}

function connection_create(event) {
    connection_draw(movedata.paths, movedata.x, movedata.y,
        event.clientX + graph.scrollLeft - container.offsetLeft,
        event.clientY + graph.scrollTop - container.offsetTop,
    );
}

function connection_redraw(paths, data) {
    connection_draw(paths,
        data.start.offsetLeft + data.start.offsetWidth / 2 - container.offsetLeft,
        data.start.offsetTop + data.start.offsetHeight / 2 - container.offsetTop,
        data.end.offsetLeft + data.end.offsetWidth / 2 - container.offsetLeft,
        data.end.offsetTop + data.end.offsetHeight / 2 - container.offsetTop,
    );
}

function connection_make() {
    if (event.target.nodeName.toLowerCase() != 'img' || event.target.dataset.type) return false;

    const isStart = elt =>
        (elt.parentNode.className == 'multiple' ? elt.parentNode : elt).previousElementSibling;
    let start, end;
    if (isStart(movedata.elt))
        start = movedata.elt;
    else
        end = movedata.elt;
    if (isStart(event.target))
        start = event.target;
    else
        end = event.target;
    if (!start || !end) return false;
    
    let last = graphsvg.children.length - 2;
    for (let i = 1; i < last; i += 2) {
        let data = eltdata.get(graphsvg.children[i]);
        if (data.start == start && data.end == end) return false;
    }
    eltdata.set(movedata.paths[1], { start: start, end: end, paths: movedata.paths });
    connection_redraw(movedata.paths, { start: start, end: end });
    
    let startdata = eltdata.get(start.parentNode.parentNode);
    if (!startdata) {
        startdata = eltdata.get(start.parentNode.parentNode.parentNode);
        eltdata.set(start.parentNode.parentNode, startdata);
    }
    let enddata = eltdata.get(end.parentNode.parentNode);
    if (!enddata) {
        enddata = eltdata.get(end.parentNode.parentNode.parentNode);
        eltdata.set(end.parentNode.parentNode, enddata);
    }
    startdata.paths.add(movedata.paths);
    enddata.paths.add(movedata.paths);
    connect(start, startdata.node, end, enddata.node);
    return true;
}

function connection_delete(path) {
    let data = eltdata.get(path);
    let startdata = eltdata.get(data.start.parentNode.parentNode);
    let enddata = eltdata.get(data.end.parentNode.parentNode);
    
    startdata.paths.delete(data.paths);
    enddata.paths.delete(data.paths);
    data.paths.forEach(p => graphsvg.removeChild(p));
    connect(data.start, startdata.node, data.end, enddata.node, true);
}

/* Audio graph area *******************************************************************************/
function graph_measure(skip) {
    graphsize = [Infinity, Infinity, -Infinity, -Infinity];
    for (let node of container.children) {
        if (node == graphsvg || node == skip)
            continue;
        if (node.offsetLeft - 8 < graphsize[0])
            graphsize[0] = node.offsetLeft - 8;
        if (node.offsetTop - 8 < graphsize[1])
            graphsize[1] = node.offsetTop - 8;
        if (node.offsetLeft + node.offsetWidth + 5 > graphsize[2])
            graphsize[2] = node.offsetLeft + node.offsetWidth + 5;
        if (node.offsetTop + node.offsetHeight + 5 > graphsize[3])
            graphsize[3] = node.offsetTop + node.offsetHeight + 5;
    }
    graphsize[0] -= container.offsetLeft;
    graphsize[1] -= container.offsetTop;
    graphsize[2] -= container.offsetLeft;
    graphsize[3] -= container.offsetTop;
}

function graph_resize(left, top, right, bottom) {
    let origin = [
        graph.scrollLeft - container.offsetLeft + graph.offsetLeft,
        graph.scrollTop - container.offsetTop,
    ];
    if (left > origin[0])
        left = origin[0];
    if (top > origin[1])
        top = origin[1];
    if (right < origin[0] + graph.clientWidth)
        right = origin[0] + graph.clientWidth;
    if (bottom < origin[1] + graph.clientHeight)
        bottom = origin[1] + graph.clientHeight;
    
    container.style.marginLeft = -left + 'px';
    container.style.marginTop = -top + 'px';
    graphsvg.style.marginLeft = left + 'px';
    graphsvg.style.marginTop = top + 'px';
    graphsvg.style.width = right - left + 'px';
    graphsvg.style.height = bottom - top + 'px';
    graphsvg.setAttribute('viewBox', [left, top, right - left, bottom - top].join(' '));
    graph.scrollTo(origin[0] - left, origin[1] - top);
}

/* Menu buttons ***********************************************************************************/
document.getElementById('menu').addEventListener('mousedown', function menu_mousedown(event) {
    if (!event.target.dataset.type || event.target.dataset.type == 'buf') return;
    let elt = node_create(event.target.dataset.type, event.target.innerHTML);

    let offset = [
        container.offsetLeft + elt.offsetWidth / 2,
        container.offsetTop + elt.offsetHeight / 2,
    ];
    
    elt.style.marginLeft = event.clientX - offset[0] + 'px';
    elt.style.marginTop = event.clientY - offset[1] + 'px';
    elt.style.position = 'absolute';

    movedata = {
        elt: elt,
        paths: new Set(),
        x: -offset[0],
        y: -offset[1],
    };
    
    document.addEventListener('mousemove', node_drag);
    document.addEventListener('mouseup', e => {
        elt.style.marginTop = elt.offsetTop + graph.scrollTop - container.offsetTop + 'px';
        if (elt.offsetLeft < container.offsetLeft)
            elt.style.marginLeft = graph.scrollLeft + 10 + 'px';
        else
            elt.style.marginLeft = elt.offsetLeft + graph.scrollLeft - container.offsetLeft + 'px';
        elt.style.position = null;
        graph_measure();
        graph_resize(...graphsize);
        document.removeEventListener('mousemove', node_drag);
    }, { once: true });
});

document.getElementById('menu').addEventListener('click', function menu_click(event) {
    if (event.target.dataset.type != 'buf') return;
    
    let html = ['<div>Audio Buffers<img src="icons.svg#close" data-type="close" /></div>'];
    for (let buf of buffers)
        html.push('<div>', buf.name, '<img src="icons.svg#delete" data-type="delete" />',
            '<img src="icons.svg#copy" data-type="copy" />',
            '<img src="icons.svg#edit" data-type="edit" /></div>');
    
    html.push('<div><input type="button" value="Raw data" data-type="raw" />',
        '<input type="button" value="Import file" data-type="file" />',
        '<input type="button" value="Close" data-type="close" /></div>');
    
    dialog.firstElementChild.innerHTML = html.join('');
    dialog.style.display = 'flex';
    dialogdata = { type: 'buffer' };
});

/* Node management ********************************************************************************/
function node_create(type, name) {
    let desc = nodes[type];
    let elt = document.createElement('fieldset');
    let node = desc.create ? desc.create(audioctx, elt) : audioctx['create' + desc.name]();
    
    let id = 1;
    while (elements.has(type + id)) id++;
    id = type + id;
    
    let html = ['<legend><input type="text" value="', id, '"/></legend><div>'];
    
    if (desc.inputs == 1)
        html.push('<img src="icons.svg#connect" />');
    else if (desc.inputs > 1)
        html.push('<span class="multiple">', '<img src="icons.svg#connect">'.repeat(desc.inputs),
            '</span>');
    
    html.push('<span>', name, '</span>');
    
    if (desc.outputs == 1)
        html.push('<img src="icons.svg#connect" />');
    else if (desc.outputs > 1)
        html.push('<span class="multiple">',
            '<img src="icons.svg#connect">'.repeat(desc.outputs), '</span>');
    
    if (node != audioctx.listener)
        html.push('<img src="icons.svg#delete" data-type="delete" />');
    html.push('<img src="icons.svg#info" data-type="info" />');
    if (desc.settings)
        html.push('<img src="icons.svg#settings" data-type="settings" />');
    if (node == audioctx.listener)
        html.push('<img src="icons.svg#pause" data-type="suspend" />');
    if (node instanceof AudioBufferSourceNode)
        html.push('<img src="icons.svg#none" data-type="settings" />');
    else if (node instanceof AudioScheduledSourceNode)
        html.push('<img src="icons.svg#play" data-type="start" />');
    if (node instanceof MediaStreamAudioDestinationNode)
        html.push('<img src="icons.svg#none" data-type="" />',
            '<img src="icons.svg#rec" data-type="recstart" />');
    
    html.push('</div>');
    
    for (let param in desc.audioparams) {
        html.push(
            '<div data-param="', param, '"><img src="icons.svg#connect" /><label>', param, ': ',
            '<input type="number" step="any" min="', node[param].minValue,
            '" max="', node[param].maxValue, '" value="', node[param].value,
            '"/></label></div>'
        );
    }
    
    for (let param in desc.continuousparams) {
        let range = desc.continuousparams[param];
        html.push(
            '<div data-param="', param, '"><label>', param, ': ',
            '<input type="number" step="any" min="', range.min,
            '" max="', range.max,'" value="', range.initial,
            '"/></label></div>'
        );
    }
    
    for (let param in desc.discreteparams) {
        html.push('<div data-param="', param, '"><label>', param, ': <select>');
        for (let opt of desc.discreteparams[param]) {
            if (Array.isArray(opt))
                html.push('<option ', opt[1], '>', opt[0], '</option>');
            else
                html.push('<option>', opt, '</option>');
        }
        html.push('</select></label></div>');
    }
    
    for (let param in desc.booleanparams) {
        html.push(
            '<div data-param="', param, '"><label>', param, ': ',
            '<input type="checkbox" ',
            desc.booleanparams[param] ? 'checked ' : '' ,'/></label></div>'
        );
    }
    
    elt.innerHTML = html.join('');
    elt.dataset.name = id;
    container.appendChild(elt);
    
    let data = { node: node, paths: new Set(), desc: desc };
    if (desc.settings)
        data.settings = desc.settings.elements.map(e => e.initial);
    if (node instanceof AudioScheduledSourceNode) {
        let img = elt.children[1].lastElementChild;
        if (node instanceof AudioBufferSourceNode)
            node.onended = evt => {
                node_reload(data, []);
                if (evt.target.buffer != null) {
                    img.src = img.src.replace(/#.*$/, '#play');
                    img.dataset.type = 'start';
                }
            }
        else
            node.onended = () => {
                node_reload(data, []);
                img.src = img.src.replace(/#.*$/, '#play');
                img.dataset.type = 'start';
            }
    }
    eltdata.set(elt, data);
    elements.set(id, elt);
    
    return elt;
}

function node_reload(data, params, running) {
    let node = AudioContext.prototype['create' + data.desc.name].apply(audioctx, params);
    for (let param in data.desc.audioparams)
        node[param].setValueAtTime(0, data.node[param].value);
    for (let param in data.desc.continuousparams)
        node[param] = data.node[param];
    for (let param in data.desc.discreteparams)
        if (param != 'type')
            node[param] = data.node[param];
    for (let param in data.desc.booleanparams)
        node[param] = data.node[param];
    
    if ((data.desc.settings || {}).reload)
        data.desc.settings.reload(data.node, node, data.settings);
    
    for (let paths of data.paths) {
        let pathdata = eltdata.get(paths[1]);
        let startdata = eltdata.get(pathdata.start.parentNode.parentNode);
        let enddata = eltdata.get(pathdata.end.parentNode.parentNode);
        let start = startdata.node, end = enddata.node;
        
        connect(pathdata.start, start, pathdata.end, end, true);
        if (start == data.node)
            start = node;
        if (end == data.node)
            end = node;
        if (!connect(pathdata.start, start, pathdata.end, end)) {
            paths.forEach(p => graphsvg.removeChild(p));
            startdata.paths.delete(paths);
            enddata.paths.delete(paths);
        }
    }
    
    node.onended = data.node.onended;
    if (running) {
        data.node.onended = null;
        data.node.stop();
    }
    data.node = node;
}

graph.addEventListener('mousedown', function node_mousedown(event) {
    let elt = event.target;
    if (elt == graph || elt == container || elt.dataset.type) {
        event.preventDefault();
        return;
    }
    let tag = elt.nodeName.toLowerCase();
    if (tag == 'input' || tag == 'select'  || tag == 'path') return;
    event.preventDefault();
    
    if (tag == 'img') {
        let line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        let clickable = line.cloneNode();
        graphsvg.appendChild(line);
        graphsvg.appendChild(clickable);
        container.className = 'connect';
        movedata = {
            elt: elt,
            paths: [line, clickable],
            x: elt.offsetLeft + elt.offsetWidth / 2 - container.offsetLeft,
            y: elt.offsetTop + elt.offsetHeight / 2 - container.offsetTop,
        };
        document.addEventListener('mousemove', connection_create);
        document.addEventListener('mouseup', e => {
            if (!connection_make())
                movedata.paths.forEach(p => graphsvg.removeChild(p));
            document.removeEventListener('mousemove', connection_create);
            container.className = '';
        }, { once: true });
    } else {
        while (elt.nodeName.toLowerCase() != 'fieldset') elt = elt.parentNode;
        graph_measure(elt);
        movedata = {
            elt: elt,
            paths: eltdata.get(elt).paths,
            x: elt.offsetLeft - event.clientX - container.offsetLeft,
            y: elt.offsetTop - event.clientY - container.offsetTop,
        };
        document.addEventListener('mousemove', node_drag);
        document.addEventListener('mouseup', e => {
            let elt = movedata.elt;
            if (elt.offsetLeft - container.offsetLeft - 8 < graphsize[0])
                graphsize[0] = elt.offsetLeft - container.offsetLeft - 8;
            if (elt.offsetTop - container.offsetTop - 8 < graphsize[1])
                graphsize[1] = elt.offsetTop - container.offsetTop - 8;
            if (elt.offsetLeft - container.offsetLeft + elt.offsetWidth + 5 > graphsize[2])
                graphsize[2] = elt.offsetLeft - container.offsetLeft + elt.offsetWidth + 5;
            if (elt.offsetTop - container.offsetTop + elt.offsetHeight + 5 > graphsize[3])
                graphsize[3] = elt.offsetTop - container.offsetTop + elt.offsetHeight + 5;
            document.removeEventListener('mousemove', node_drag);
        }, { once: true });
    }
});

function node_drag(event) {
    let left = movedata.x + event.clientX, top = movedata.y + event.clientY;
    if (!movedata.elt.style.position)
        graph_resize(
            Math.min(graphsize[0], left - 8),
            Math.min(graphsize[1], top - 8),
            Math.max(graphsize[2], left + movedata.elt.offsetWidth + 5),
            Math.max(graphsize[3], top + movedata.elt.offsetHeight + 5),
        );
    
    movedata.elt.style.marginLeft = left + 'px';
    movedata.elt.style.marginTop = top + 'px';
    
    movedata.paths.forEach(paths => connection_redraw(paths, eltdata.get(paths[1])));
}

graph.addEventListener('click', function node_click(event) {
    switch (event.target.nodeName.toLowerCase()) {
    case 'path':
        connection_delete(event.target);
        break;
    case 'img':
        let elt = event.target.parentNode.parentNode;
        let data = eltdata.get(elt);
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
            audioctx.suspend();
            event.target.src = event.target.src.replace(/#.*$/, '#play');
            event.target.dataset.type = 'resume';
            break;
        case 'resume':
            audioctx.resume();
            event.target.src = event.target.src.replace(/#.*$/, '#pause');
            event.target.dataset.type = 'suspend';
            break;
        case 'recstart':
            if (!data.settings[2])
                data.desc.settings.apply(elt, data.node, data.settings);
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
            for (let paths of data.paths)
                connection_delete(paths[1]);
            if (elt.children[1].firstElementChild.dataset.type == 'stop') {
                data.node.onended = null;
                data.node.stop();
            }
            if (data.desc.delete)
                data.desc.delete(data.node);
            container.removeChild(elt);
            elements.delete(elt.dataset.name);
            break;
        case 'settings':
            dialog_make(
                data.desc.name + ' ' + elt.firstElementChild.firstElementChild.value,
                data.desc.settings.elements,
                data.settings,
            );
            dialogdata = { type: 'settings', elt: elt, data: data };
            break;
        case 'info':
            if (data.desc.info) {
                mdninfo_show(data.desc.info);
            } else {
                let name = data.node.constructor.name;
                if (data.desc.name == 'MediaStreamSource')
                    name = 'MediaStreamAudioSourceNode';
                let url = 'https://developer.mozilla.org/en-US/docs/Web/API/' + name;
                let text = document.createElement('p');
                text.textContent = 'loading...';
                data.desc.info = { name: name, url: url, text: text };
                mdninfo_show(data.desc.info);
                
                let xhr = new XMLHttpRequest();
                xhr.onload = () => {
                    data.desc.info.text = xhr.response.querySelector('.main-page-content > div > :not(:empty)');
                    data.desc.info.style = xhr.response.querySelector('link[rel="stylesheet"]');
                    mdninfo_show(data.desc.info);
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
});

graph.addEventListener('input', function node_input(event) {
    let tag = event.target.nodeName.toLowerCase();
    if (tag != 'input' && tag != 'select') return;
    let elt = event.target.parentNode.parentNode;
    if (elt.nodeName.toLowerCase() == 'fieldset') {
        let name = event.target.value;
        if (name == elt.dataset.name)
            event.target.style.borderColor = null;
        else if (elements.has(name))
            event.target.style.borderColor = "#f00";
        else {
            event.target.style.borderColor = null;
            elements.set(name, elt);
            elements.delete(elt.dataset.name);
            elt.dataset.name = name;
        }
        return;
    }
    let param = elt.dataset.param;
    let node = eltdata.get(elt.parentNode).node;
    if (node[param] instanceof AudioParam)
        node[param].setValueAtTime(event.target.value, 0);
    else if (event.target.type == 'checkbox')
        node[param] = event.target.checked;
    else
        node[param] = event.target.value;
});

/* Visualisations *********************************************************************************/
function draw_frame() {
    requestAnimationFrame(draw_frame);
    
    for (let [node, data] of animate.filter.entries()) {
        node.getFrequencyResponse(frequencies, data[3].magn, data[3].phase);
        if (data[0]) {
            let path = ['M'];
            for (let i = 0; i < frequencies.length; i++)
                path.push(i, 150 - 75 * data[3].magn[i]);
            data[4][0].firstElementChild.setAttribute('d', path.join(' '));
        }
        if (data[1]) {
            let path = ['M'];
            for (let i = 0; i < frequencies.length; i++)
                path.push(i, 75 - 20 * Math.log(data[3].magn[i]));
            data[4][1].firstElementChild.setAttribute('d', path.join(' '));
        }
        if (data[2]) {
            let path = ['M'];
            for (let i = 0; i <= frequencies.length; i++)
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

}

/* Audio params ***********************************************************************************/
param.addEventListener('click', function param_click(event) {
    switch (event.target.nodeName.toLowerCase()) {
    case 'button':
        let div = document.createElement('div');
        div.innerHTML = '<select><option default hidden>Choose node</option></select>' +
            '<select></select><img src="icons.svg#delete" data-type="delete">';
        param.appendChild(div);
        let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        let path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        svg.appendChild(path);
        param.appendChild(svg);
        eltdata.set(svg, { points: [], range: [-Infinity, Infinity, -Infinity] });
        break;
    case 'img':
        let elt = event.target.parentNode.parentNode;
        switch (event.target.dataset.type) {
        case 'start':
            let bps = 60 / event.target.previousElementSibling.previousElementSibling.value;
            let start = audioctx.currentTime;
            for (let elt of param.children) {
                if (elt.nodeName.toLowerCase() != 'svg') continue;
                let names = elt.previousElementSibling.children;
                let data = eltdata.get(elements.get(names[0].value));
                if (!data || !names[1].value) continue;
                let points = eltdata.get(elt).points;
                let audioparam = data.node[names[1].value];
                for (let p of points)
                    switch (p[1]) {
                    case 'value':
                        audioparam.setValueAtTime(p[2] * bps, start + p[0] * bps);
                        break;
                    case 'linear':
                        audioparam.linearRampToValueAtTime(p[2] * bps, start + p[0] * bps);
                        break;
                    case 'exponential':
                        audioparam.exponentialRampToValueAtTime(p[2] * bps, start + p[0] * bps);
                        break;
                    case 'target':
                        audioparam.setTargetAtTime(p[2] * bps, start + p[0] * bps, p[3] * bps);
                        audioparam.setTargetAtTime(p[2] * bps, start + p[0] * bps, p[3] * bps);
                        break;
                    }
            }
            break;
        case 'stop':
            for (let elt of param.children) {
                if (elt.nodeName.toLowerCase() != 'svg') continue;
                let names = elt.previousElementSibling.children;
                let data = eltdata.get(elements.get(names[0].value));
                if (!data || !names[1].value) continue;
                data.node[names[1].value].cancelScheduledValues(0);
            }
            break;
        case 'delete':
            param.removeChild(event.target.parentNode.nextElementSibling);
            param.removeChild(event.target.parentNode);
            break;
        }
        break;
    case 'svg':
        let data = eltdata.get(event.target);
        let types = ['value', 'linear', 'exponential', 'target'];
        let html = ['<div>Audio Timeline<img src="icons.svg#close" data-type="close" /></div>'];
        for (let p of data.points) {
            html.push('<div><input type="number" step="any" value="', p[0],
                '" required class="small">s: <select>');
            for (let t of types)
                html.push(t == p[1] ? '<option selected>' : '<option>', t, '</option>');
            html.push('</select> to <input type="number" step="any" value="', p[2],'" required>',
                '<input type="number" step="any" value="', p[3], '" class="small">',
                '<img src="icons.svg#delete" data-type="delete" /></div>');
        }
        html.push('<div><input type="button" value="Add point" data-type="new" />',
            '<input type="submit" value="Apply">',
            '<input type="button" value="Cancel" data-type="close"></div>');
        
        dialog.firstElementChild.innerHTML = html.join('');
        dialog.style.display = 'flex';
        dialogdata = { type: 'param', data: data, elt: event.target };
        break;
    }
});

param.addEventListener('focusin', function param_focus(event) {
    if (event.target.nodeName.toLowerCase() != 'select') return;
    if (event.target.nextElementSibling.nodeName.toLowerCase() != 'select') return;
    let value = event.target.value;
    let html = [];
    for (let e of elements.keys())
        html.push(e == value ? '<option selected>' : '<option>', e, '</option>');
    event.target.innerHTML = html.join('');
});

param.addEventListener('input', function param_input(event) {
    if (event.target.nodeName.toLowerCase() != 'select') return;
    let next = event.target.nextElementSibling;
    if (next.nodeName.toLowerCase() != 'select') return;
    let data = eltdata.get(elements.get(event.target.value));
    let html = ['<option hidden>Choose param</option>'];
    for (let p in data.desc.audioparams) html.push('<option>', p, '</option>');
    next.innerHTML = html.join('');
});

function param_draw(elt, data) {
    let param = elt.previousElementSibling.children;
    let paramdata = eltdata.get(elements.get(param[0].value));
    let first = 0;
    if (paramdata && paramdata.node[param[1].value])
        first = paramdata.node[param[1].value].value;
    let map = val => (elt.clientHeight - 8) * (data.range[2] - val) / (data.range[2] - data.range[1]);
    let time = t => 100 * t;
    let d = ['M0,', map(first)];
    
    for (let i in data.points) {
        let p = data.points[i];
        switch (p[1]) {
        case 'value':
            d.push('H', time(p[0]), 'V', map(p[2]));
            break;
        case 'linear':
            d.push('L', time(p[0]), ',', map(p[2]));
            break;
        case 'exponential':
            let prev = i == 0 ? [0, '', first] : data.points[i - 1];
            d.push('Q', time((prev[0] + p[0]) / 2), ',', map(Math.min(prev[2], p[2])), ',',
                time(p[0]), ',', map(p[2]));
            break;
        case 'target':
            let next = i == data.points.length - 1 ? p[0] + 5 * p[3] : data.points[+i + 1][0];
            d.push('H', time(p[0]), 'Q', time(p[0] + p[3]), ',', map(p[2]), ',',
                time(next), ',', map(p[2]));
            break;
        }
    }
    elt.firstElementChild.setAttribute('d', d.join(''));
}

/* Initialisation *********************************************************************************/
(function init() {
    let elt = node_create('dest', 'Destination');
    elt.style.marginTop = '10px';
    elt.style.marginLeft = graph.clientWidth - elt.offsetWidth - 15 + 'px';
    graph_measure();
    graph_resize(...graphsize);
    
    let step = (Math.log(20000) - Math.log(20)) / (frequencies.length - 1);
    for (let i = 0; i < frequencies.length; i++)
        frequencies[i] = 20 * Math.exp(i * step);
    draw_frame();
    
    let close = document.createElement('img');
    close.src = document.baseURI.replace(/\/[^/]*(?:\?.*)?(?:#.*)?$/, '/icons.svg#close');
    close.id = 'close-img';
    close.addEventListener('click', () => mdninfo.style.display = 'none');
    mdninfo.onload = () =>
        mdninfo.contentDocument.body.firstElementChild.firstElementChild.appendChild(close);

    mdninfo.srcdoc = `
<!DOCTYPE html>
<html>
    <head>
        <base href="https://developer.mozilla.org/" target="_blank" />
        <link rel="stylesheet" href="data:text/css,h1{font-size:2.25rem}body{font-family:Inter,sans-serif}"/>
        <style>
@font-face {
    font-family:"Inter";
    src:url(https://api.allorigins.win/raw?url=https://developer.mozilla.org/static/media/Inter.var.c2fe3cb2.woff2) format("woff2 supports variations"),
        url(https://api.allorigins.win/raw?url=https://developer.mozilla.org/static/media/Inter.var.c2fe3cb2.woff2) format("woff2-variations");
    font-weight:1 999;
    font-stretch:75% 100%;
    font-style:oblique 0deg 20deg;
    font-display:swap;
}

body {
    background-color: #000a;
}

#close-img {
    width: 0.5em;
    float: right;
    margin: 0.2em;
    border: none !important;
}

.main-page-content {
    background: #fff;
    max-width: 80ch;
    margin: 0 auto;
    padding: 2rem;
}
        </style>
    </head>
    <body class="light">
        <article class="main-page-content">
            <h1>name</h1>
            <p></p>
            <p><a>Read more …</a></p>
            <p><a>name</a> by <a>Mozilla Contributors</a> is licensed under
            <a href="https://creativecommons.org/licenses/by-sa/2.5/" rel="noopener">CC-BY-SA 2.5</a>.</p>
        </article>
    </body>
</html>`;
})();
