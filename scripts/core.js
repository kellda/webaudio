'use strict';

const core = {
    audioctx: new (AudioContext || webkitAudioContext)(),
    eltdata: new WeakMap(),
    elements: new Map(),
};

core.save = function() {
    let save = { elts: {}, paths: [], params: [] };
    for (let [id, node] of core.elements.entries()) {
        let params = {};
        for (let elt of node.elt.children) {
            let param = elt.dataset.param;
            if (!param) continue;
            elt = elt.lastElementChild.lastElementChild;
            params[param] = elt.type == 'checkbox' ? elt.checked : elt.value;
        }
        save.elts[id] = {
            type: node.type,
            params: params,
            position: [node.elt.style.marginLeft, node.elt.style.marginTop],
        }
        
        if (node.settings) {
            let settings = [], elements = node.desc.settings.elements;
            for (let i in elements) {
                switch (elements[i].type) {
                case 'mediastream':
                case 'file':
                    settings[i] = undefined;
                    break;
                case 'buffer':
                    settings[i] = { type: 'none' };
                    break;
                default:
                    settings[i] = node.settings[i];
                }
            }
            save.elts[id].settings = settings;
        }
        
        for (let path of node.paths) {
            if (path.start.data == node) {
                save.paths.push({
                    start: [id, path.start.index],
                    end: [path.end.data.elt.dataset.name, path.end.index],
                });
            }
        }
    }
    for (let elt of param.children) {
        if (elt.tagName.toLowerCase() != 'svg') continue;
        let param = core.eltdata.get(elt);
        save.params.push({
            param: [param.div.children[0].value, param.div.children[1].value],
            points: param.points, range: param.range,
        });
    }
    return save;
}

core.load = function(save) {
    for (let id in save.elts) {
        let data = save.elts[id];
        let node = new Node(data.type, id);
        node.elt.style.marginLeft = data.position[0];
        node.elt.style.marginTop = data.position[1];
        
        for (let elt of node.elt.children) {
            let param = elt.dataset.param;
            if (!param) continue;
            let value = data.params[param];
            if (param == 'type' && value == 'custom') continue;
            elt = elt.lastElementChild.lastElementChild;
            if (elt.type == 'checkbox')
                elt.checked = value;
            else
                elt.value = value;
            if (node.node[param] instanceof AudioParam)
                node.node[param].setValueAtTime(value, 0);
            else
                node.node[param] = value;
        }
        
        if (node.desc.settings) {
            node.settings = data.settings;
            if (!(node.node instanceof OscillatorNode) || data.params.type == 'custom')
                node.apply();
        }
    }
    
    for (let path of save.paths) {
        let elts = core.elements.get(path.start[0]).elt.children[1].children;
        let start, end;
        start = elts[0].tagName.toLowerCase() == 'img' || elts[0].className == 'multiple' ?
            elts[2] : elts[1];
        if (start.className == 'multiple')
            start = start.children[path.start[1]];
        if (typeof path.end[1] == 'string') {
            end = core.elements.get(path.end[0]).elt
                .querySelector('[data-param=' + path.end[1] + '] img');
        } else {
            end = core.elements.get(path.end[0]).elt.children[1].children[0];
            if (end.className == 'multiple')
                end = end.children[path.end[1]];
        }
        let line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        let clickable = line.cloneNode();
        ui.svg.appendChild(line);
        ui.svg.appendChild(clickable);
        new Connection(start, end, [line, clickable]);
    }

    for (let desc of save.params) {
        let param = new Param();
        param.div.children[0].innerHTML = '<option>' + desc.param[0] + '</option>';
        ui.param_input({ target: param.div.children[0] })
        param.div.children[1].value = desc.param[1];
        param.points = desc.points;
        param.range = desc.range;
        param.draw();
    }
    
    ui.resize(...ui.measure());
}

core.clear = function() {
    core.elements.forEach(node => node.delete());
    while (ui.param.children[2]) ui.param.removeChild(ui.param.children[2]);
}

function Node(type, id) {
    this.type = type;
    this.desc = nodes[type];
    this.paths = new Set();
    this.elt = document.createElement('fieldset');
    if (this.desc.settings)
        this.settings = this.desc.settings.elements.map(e => e.initial);
    this.node = this.desc.create ?
        this.desc.create(core.audioctx, this) : core.audioctx['create' + this.desc.type]();
    
    if (!id || core.elements.has(id)) {
        id ||= type;
        let n = 1;
        while(core.elements.has(id + n)) n++;
        id += n;
    }
    
    this.elt.innerHTML = Node.html(this.node, this.desc, id);
    this.elt.dataset.name = id;
    
    if (this.node instanceof AudioScheduledSourceNode) {
        let img = this.elt.children[1].lastElementChild;
        if (this.node instanceof AudioBufferSourceNode) {
            this.node.onended = () => {
                if (this.node.buffer != null) {
                    img.src = img.src.replace(/#.*$/, '#play');
                    img.dataset.type = 'start';
                }
                this.reload([]);
            }
        } else {
            this.node.onended = () => {
                img.src = img.src.replace(/#.*$/, '#play');
                img.dataset.type = 'start';
                this.reload([]);
            }
        }
    }
    ui.container.appendChild(this.elt);
    core.eltdata.set(this.elt, this);
    core.elements.set(id, this);
}

Node.html = function(node, desc, id) {
    let html = ['<legend><input type="text" value="', id, '"/></legend><div>'];
    if (node.numberOfInputs == 1)
        html.push('<img src="icons.svg#connect" />');
    else if (node.numberOfInputs > 1)
        html.push('<span class="multiple">',
            '<img src="icons.svg#connect">'.repeat(node.numberOfInputs), '</span>');
    html.push('<span>', desc.name, '</span>');
    if (node.numberOfOutputs == 1)
        html.push('<img src="icons.svg#connect" />');
    else if (node.numberOfOutputs > 1)
        html.push('<span class="multiple">',
            '<img src="icons.svg#connect">'.repeat(node.numberOfOutputs), '</span>');
    
    if (node != core.audioctx.destination)
        html.push('<img src="icons.svg#delete" data-type="delete" />');
    html.push('<img src="icons.svg#info" data-type="info" />');
    if (desc.settings)
        html.push('<img src="icons.svg#settings" data-type="settings" />');
    if (node == core.audioctx.destination)
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
        html.push('<div data-param="', param, '"><img src="icons.svg#connect" /><label>', param,
            ': <input type="number" step="any" min="', node[param].minValue,
            '" max="', node[param].maxValue, '" value="', node[param].value, '"/></label></div>');
    }
    for (let param in desc.continuousparams) {
        let range = desc.continuousparams[param];
        html.push('<div data-param="', param, '"><label>', param,
        ': <input type="number" step="any" min="', range.min, '" max="', range.max,
        '" value="', range.initial, '"/></label></div>');
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
        html.push('<div data-param="', param, '"><label>', param, ': <input type="checkbox" ',
            desc.booleanparams[param] ? 'checked ' : '' ,'/></label></div>');
    }
    
    return html.join('');
};

Node.prototype.reload = function(params, running) {
    let node = core.audioctx['create' + this.desc.type](...params);
    for (let param in this.desc.audioparams)
        node[param].setValueAtTime(this.node[param].value, 0);
    for (let param in this.desc.continuousparams)
        node[param] = this.node[param];
    for (let param in this.desc.discreteparams)
        if (param != 'type') node[param] = this.node[param];
    for (let param in this.desc.booleanparams)
        node[param] = this.node[param];
    
    if ((this.desc.settings || {}).reload)
        this.desc.settings.reload(this.node, node, this.settings);
    
    for (let path of this.paths) {
        path.connect(true);
    }
    
    node.onended = this.node.onended;
    if (running) {
        this.node.onended = null;
        this.node.stop();
    }
    this.node = node;
    
    for (let path of this.paths) {
        if (path.start.index >= path.start.data.node.numberOfOutputs ||
                path.end.index >= path.end.data.node.numberOfInputs) {
            path.start.data.paths.delete(path);
            path.end.data.paths.delete(path);
            path.paths.forEach(p => ui.svg.removeChild(p));
        } else
            path.connect();
    }
    
};

Node.prototype.apply = function(running) {
    let node = this.node == core.audioctx.destination ? core.audioctx.listener : this.node;
    let args = this.desc.settings.apply(node, this.settings, this.elt, this.paths);
    if (args) this.reload(args, running);
};

Node.prototype.delete = function() {
    if (this.elt.children[1].lastElementChild.dataset.type == 'stop') {
        this.node.onended = null;
        this.node.stop();
    }
    this.paths.forEach(path => path.delete());
    if (this.desc.delete)
        this.desc.delete(this.node);
    ui.container.removeChild(this.elt);
    core.elements.delete(this.elt.dataset.name);
}

function Connection(start, end, paths) {
    core.eltdata.set(paths[1], this);
    this.paths = paths;
    
    let data, index;
    if (start.parentNode.className == 'multiple') {
        data = core.eltdata.get(start.parentNode.parentNode.parentNode);
        index = Array.prototype.indexOf.call(start.parentNode.children, start);
    } else {
        data = core.eltdata.get(start.parentNode.parentNode);
        index = 0;
    }
    data.paths.add(this);
    this.start = { elt: start, data: data, index: index };

    if (end.parentNode.className == 'multiple') {
        data = core.eltdata.get(end.parentNode.parentNode.parentNode);
        index = Array.prototype.indexOf.call(end.parentNode.children, end);
    } else {
        data = core.eltdata.get(end.parentNode.parentNode);
        index = end.parentNode.dataset.param || 0;
    }
    data.paths.add(this);
    this.end = { elt: end, data: data, index: index };

    this.redraw();
    this.connect();
}

Connection.draw = function(paths, x1, y1, x2, y2) {
    let d = `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;
    paths.forEach(p => p.setAttribute('d', d));
}

Connection.prototype.redraw = function() {
    Connection.draw(this.paths, 
        this.start.elt.offsetLeft + this.start.elt.offsetWidth / 2 - ui.container.offsetLeft,
        this.start.elt.offsetTop + this.start.elt.offsetHeight / 2 - ui.container.offsetTop,
        this.end.elt.offsetLeft + this.end.elt.offsetWidth / 2 - ui.container.offsetLeft,
        this.end.elt.offsetTop + this.end.elt.offsetHeight / 2 - ui.container.offsetTop);
}

Connection.prototype.connect = function(disconnect) {
    let fn = disconnect ? 'disconnect' : 'connect';
    if (typeof this.end.index == 'string')
        this.start.data.node[fn](this.end.data.node[this.end.index], this.start.index);
    else
        this.start.data.node[fn](this.end.data.node, this.start.index, this.end.index);
}

Connection.prototype.delete = function() {
    this.start.data.paths.delete(this);
    this.end.data.paths.delete(this);
    this.paths.forEach(p => ui.svg.removeChild(p));
    this.connect(true);
}

function Param() {
    this.points = [];
    this.range = [-Infinity, Infinity, -Infinity];
    this.div = document.createElement('div');
    this.div.innerHTML = '<select><option default hidden>Choose node</option></select>' +
        '<select></select><img src="icons.svg#delete" data-type="delete">';
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.svg.appendChild(this.path);
    ui.param.appendChild(this.div);
    ui.param.appendChild(this.svg);
    core.eltdata.set(this.svg, this);
}

Param.prototype.start = function(start, bps) {
    let node = core.elements.get(this.div.children[0].value);
    if (!node || !this.div.children[1].value) return;
    let audioparam = node.node[this.div.children[1].value];
    for (let p of this.points) {
        switch (p[1]) {
        case 'value':
            audioparam.setValueAtTime(p[2], start + p[0] * bps);
            break;
        case 'linear':
            audioparam.linearRampToValueAtTime(p[2], start + p[0] * bps);
            break;
        case 'exponential':
            audioparam.exponentialRampToValueAtTime(p[2], start + p[0] * bps);
            break;
        case 'target':
            audioparam.setTargetAtTime(p[2], start + p[0] * bps, p[3] * bps);
            break;
        }
    }
}

Param.prototype.draw = function() {
    let paramdata = core.elements.get(this.div.children[0].value);
    let first = 0;
    if (paramdata && paramdata.node[this.div.children[1].value])
        first = paramdata.node[this.div.children[1].value].value;
    let map = val => (this.div.clientHeight - 8) *
        (this.range[2] - val) /(this.range[2] - this.range[1]);
    let time = t => 100 * t;
    let d = ['M0,', map(first)];
    
    for (let i in this.points) {
        let p = this.points[i];
        switch (p[1]) {
        case 'value':
            d.push('H', time(p[0]), 'V', map(p[2]));
            break;
        case 'linear':
            d.push('L', time(p[0]), ',', map(p[2]));
            break;
        case 'exponential':
            let prev = i == 0 ? [0, '', first] : this.points[i - 1];
            d.push('Q', time((prev[0] + p[0]) / 2), ',', map(Math.min(prev[2], p[2])), ',',
                time(p[0]), ',', map(p[2]));
            break;
        case 'target':
            let next = i == this.points.length - 1 ? p[0] + 5 * p[3] : this.points[+i + 1][0];
            d.push('H', time(p[0]), 'Q', time(p[0] + p[3]), ',', map(p[2]), ',',
                time(next), ',', map(p[2]));
            break;
        }
    }
    this.svg.firstElementChild.setAttribute('d', d.join(''));
};
