'use strict';

/* Global variables *******************************************************************************/
let audioctx = new (AudioContext || webkitAudioContext)();
let container = document.getElementById('container');
let dialog = document.getElementById('dialog');
let eltdata = new WeakMap(), nextpos = { x: 0, y: 0 };
let movedata, dialogelt;

/* Settings modal dialog **************************************************************************/
dialog.firstElementChild.addEventListener('submit', function settings_apply(event) {
	event.preventDefault();
	let data = eltdata.get(dialogelt);
	let elements = data.desc.settings.elements;
	let labels = dialog.firstElementChild.children;
	for (let i in elements) {
		switch (elements[i].type) {
		case 'checkbox':
			data.settings[i] = labels[+i+1].lastElementChild.checked;
			break;
		default:
			data.settings[i] = labels[+i+1].lastElementChild.value;
			break;
		}
	}
	let args = data.desc.settings.apply(dialogelt, data.node, data.settings);
	if (args) {
		node_reload(data, args);
	}
	dialog.style.display = 'none';
});

dialog.firstElementChild.addEventListener('click', function settings_close(event) {
	if (event.target.dataset.type == 'close') dialog.style.display = 'none';
});

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

function connection_draw(path, x1, y1, x2, y2) {
	path.setAttribute('d',
		`M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`);
	//path.setAttribute('d',
	//	`M${x1},${y1} C${x1},${Math.min(y1,y2) - 50} ${x2},${Math.min(y1,y2) - 50} ${x2},${y2}`);
}

function connection_create(event) {
	connection_draw(movedata.path, movedata.x, movedata.y,
		event.clientX + window.scrollX - container.offsetLeft,
		event.clientY + window.scrollY - container.offsetTop,
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
	
	eltdata.set(movedata.path, { start: start, end: end });
	connection_draw(movedata.path,
		start.offsetLeft + start.offsetWidth / 2,
		start.offsetTop + start.offsetHeight / 2,
		end.offsetLeft + end.offsetWidth / 2,
		end.offsetTop + end.offsetHeight / 2,
	);
	
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
	startdata.paths.push(movedata.path);
	enddata.paths.push(movedata.path);
	connect(start, startdata.node, end, enddata.node);
	return true;
}

function connection_delete(path) {
	let data = eltdata.get(path);
	let startdata = eltdata.get(data.start.parentNode.parentNode);
	let enddata = eltdata.get(data.end.parentNode.parentNode);
	
	startdata.paths.splice(startdata.paths.indexOf(path), 1);
	enddata.paths.splice(enddata.paths.indexOf(path), 1);
	container.firstElementChild.removeChild(path);
	connect(data.start, startdata.node, data.end, enddata.node, true);
}

/* Node management ********************************************************************************/
function node_make(type, name) {
	let desc = nodes[type];
	let node = desc.create ? desc.create(audioctx) : audioctx['create' + desc.name]();
	let elt = document.createElement('fieldset');
	
	let html = ['<legend><input type="text" value="', type, '"/></legend><div>'];
	if (desc.inputs == 1)
		html.push('<img src="icons.svg#circle" />');
	else if (desc.inputs > 1)
		html.push('<span class="multiple">', '<img src="icons.svg#circle">'.repeat(desc.inputs),
			'</span>');

	if (node instanceof AudioScheduledSourceNode)
		html.push('<img src="icons.svg#play" data-type="start" />');
	html.push('<span>', name, '</span>');
	
	if (desc.outputs == 1)
		html.push('<img src="icons.svg#circle" />');
	else if (desc.outputs > 1)
		html.push('<span class="multiple">',
			'<img src="icons.svg#circle">'.repeat(desc.outputs), '</span>');
	
	if (desc.settings)
		html.push('<img src="icons.svg#settings" data-type="settings" />');
	html.push('<img src="icons.svg#delete" data-type="delete" /></div>');
	
	for (let param in desc.audioparams) {
		html.push(
			'<div data-param="', param, '"><img src="icons.svg#circle" /><label>', param, ': ',
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
	container.appendChild(elt);
	
	let data = { node: node, paths: [], desc: desc };
	if (desc.settings)
		data.settings = desc.settings.elements.map(e => e.initial);
	if (node instanceof AudioScheduledSourceNode) {
		let img = elt.children[1].firstElementChild;
		node.onended = () => {
			node_reload(data, [], img);
			img.src = img.src.replace(/#.*$/, '#play');
			img.dataset.type = 'start';
		}
	}
	eltdata.set(elt, data);
	
	return elt;
}

document.getElementById('menu').addEventListener('mousedown', function node_create(event) {
	if (!event.target.dataset.type) return;
	let elt = node_make(event.target.dataset.type, event.target.innerHTML);

	let offset = [
		container.offsetLeft + elt.offsetWidth/2,
		container.offsetTop + elt.offsetHeight/2,
	];
	
	elt.style.marginLeft = event.clientX + window.scrollX - offset[0] + 'px';
	elt.style.marginTop = event.clientY + window.scrollY - offset[1] + 'px';
	elt.style.zIndex = 1;

	movedata = {
		elt: elt,
		paths: [],
		x: -offset[0],
		y: -offset[1],
	};
	document.addEventListener('mousemove', node_drag);
	document.addEventListener('mouseup', e => {
		if (elt.offsetTop < 0) {
			elt.style.marginTop = '0px';
			if (nextpos.x + elt.offsetWidth > container.clientWidth)
				nextpos.x = 0;
			elt.style.marginLeft = nextpos.x + 'px';
			nextpos.x += elt.offsetWidth + 10;
		}
		elt.style.zIndex = null;
		document.removeEventListener('mousemove', node_drag);
	}, { once: true });
});

function node_reload(data, params, img) {
	let node = AudioContext.prototype['create' + data.desc.name].apply(audioctx, params);
	for (let param in data.desc.audioparams)
		node[param].value = data.node[param].value;
	for (let param in data.desc.continuousparams)
		node[param] = data.node[param];
	for (let param in data.desc.discreteparams)
		if (param != 'type')
			node[param] = data.node[param];
	for (let param in data.desc.booleanparams)
		node[param] = data.node[param];
	
	if ((data.desc.settings || {}).reload)
		data.desc.settings.reload(data.node, node, data.settings);
	
	for (let i = data.paths.length - 1; i >= 0; i--) {
		let pathdata = eltdata.get(data.paths[i]);
		let startdata = eltdata.get(pathdata.start.parentNode.parentNode);
		let enddata = eltdata.get(pathdata.end.parentNode.parentNode);
		let start = startdata.node, end = enddata.node;
		
		connect(pathdata.start, start, pathdata.end, end, true);
		if (start == data.node)
			start = node;
		if (end == data.node)
			end = node;
		if (!connect(pathdata.start, start, pathdata.end, end)) {
			container.firstElementChild.removeChild(data.paths[i]);
			startdata.paths.splice(startdata.paths.indexOf(data.paths[i]), 1);
			enddata.paths.splice(enddata.paths.indexOf(data.paths[i]), 1);
		}
	}
	
	node.onended = data.node.onended;
	data.node = node;
}

container.addEventListener('mousedown', function node_mousedown(event) {
	let elt = event.target;
	if (elt == container || elt.dataset.type) return;
	let tag = elt.nodeName.toLowerCase();
	if (tag == 'input' || tag == 'select'  || tag == 'path') return;
	event.preventDefault();
	
	if (tag == 'img') {
		let path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		container.firstElementChild.appendChild(path);
		container.className = 'connect';
		movedata = {
			elt: elt,
			path: path,
			x: elt.offsetLeft + elt.offsetWidth / 2,
			y: elt.offsetTop + elt.offsetHeight / 2,
		};
		document.addEventListener('mousemove', connection_create);
		document.addEventListener('mouseup', function node_mouseup(event) {
			if (!connection_make())
				container.firstElementChild.removeChild(movedata.path);
			document.removeEventListener('mousemove', connection_create);
			container.className = '';
		}, { once: true });
	} else {
		while (elt.nodeName.toLowerCase() != 'fieldset') elt = elt.parentNode;
		movedata = {
			elt: elt,
			paths: eltdata.get(elt).paths,
			x: elt.offsetLeft - event.clientX - window.scrollX,
			y: elt.offsetTop - event.clientY - window.scrollY,
		};
		document.addEventListener('mousemove', node_drag);
		document.addEventListener('mouseup',
			e => document.removeEventListener('mousemove', node_drag), { once: true });
	}
});

function node_drag(event) {
	movedata.elt.style.marginLeft = movedata.x + event.clientX + window.scrollX + 'px';
	movedata.elt.style.marginTop = movedata.y + event.clientY + window.scrollY + 'px';
	for (let path of movedata.paths) {
		let data = eltdata.get(path);
		connection_draw(path,
			data.start.offsetLeft + data.start.offsetWidth / 2,
			data.start.offsetTop + data.start.offsetHeight / 2,
			data.end.offsetLeft + data.end.offsetWidth / 2,
			data.end.offsetTop + data.end.offsetHeight / 2,
		);
	}
}

container.addEventListener('click', function node_click(event) {
	switch (event.target.nodeName.toLowerCase()) {
	case 'path':
		connection_delete(event.target);
		break;
	case 'img':
		let elt = event.target.parentNode.parentNode;
		let data = eltdata.get(elt);
		switch (event.target.dataset.type) {
		case 'start':
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
		case 'delete':
			while(data.paths.length)
				connection_delete(data.paths[0]);
			if (elt.children[1].firstElementChild.dataset.type == 'stop') {
				data.node.onended = null;
				data.node.stop();
			}
			container.removeChild(elt);
			break;
		case 'settings':
			let html = ['<div>', data.desc.name, ' ', elt.firstElementChild.firstElementChild.value,
				'<img src="icons.svg#close" data-type="close" /></div>'];
			let elements = data.desc.settings.elements;
			for (let i in elements) {
				html.push('<label>', elements[i].label, ': ');
				switch (elements[i].type) {
				case 'textarea':
					html.push('<textarea>', data.settings[i], '</textarea>');
					break;
				case 'checkbox':
					html.push('<input type="checkbox"', data.settings[i] ? ' checked' : '', ' />');
					break;
				case 'number':
					html.push('<input type="number" step="any" min="', elements[i].min,
						'" max="', elements[i].max, '" value="', data.settings[i], '">');
					break;
				default:
					html.push('<input type="', elements[i].type, '" value="', data.settings[i], '" />');
					break;
				}
				html.push('</label>');
			}
			html.push('<div><input type="submit" value="Apply"/>',
				'<input type="button" value="Cancel" data-type="close" /></div>');
			dialog.firstElementChild.innerHTML = html.join('');
			dialog.style.display = 'flex';
			dialogelt = elt;
			break;
		}
		break;
	}
});

container.addEventListener('input', function node_input(event) {
	let tag = event.target.nodeName.toLowerCase();
	if (tag != 'input' && tag != 'select') return;
	let elt = event.target.parentNode.parentNode;
	if (elt.nodeName.toLowerCase() == 'fieldset') return;
	let param = elt.dataset.param;
	let node = eltdata.get(elt.parentNode).node;
	if (node[param] instanceof AudioParam)
		node[param].value = event.target.value;
	else if (event.target.type == 'checkbox')
		node[param] = event.target.checked;
	else
		node[param] = event.target.value;
});

/* Initialisation *********************************************************************************/
(function iit() {
	let elt = node_make('dest', 'Destination');
	elt.style.marginTop = '0px';
	elt.style.marginLeft = container.clientWidth - elt.offsetWidth - 10 + 'px';
})();