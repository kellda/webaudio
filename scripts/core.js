'use strict';

const core = {
    audioctx: new (AudioContext || webkitAudioContext)(),
    eltdata: new WeakMap(),
    elements: new Map(),
};

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
    else if (node instanceof AudioScheduledSourceNode && desc.type != 'MediaStreamSource')
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
    let node = AudioContext.prototype['create' + this.desc.type].apply(core.audioctx, params);
    for (let param in this.desc.audioparams)
        node[param].setValueAtTime(0, this.node[param].value);
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
        node = data.node;
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
