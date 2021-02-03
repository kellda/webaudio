'use strict';

/* Global variables *******************************************************************************/
let audioctx = new (AudioContext || webkitAudioContext)();
let container = document.getElementById('container');
let dialog = document.getElementById('dialog');
let eltdata = new WeakMap(), nextpos = { x: 0, y: 0 }, buffers = [];
let movedata, dialogdata;

/* Settings modal dialog **************************************************************************/

function dialog_make(name, elements, settings) {
	let html = ['<div>', name, '<img src="icons.svg#close" data-type="close" /></div>'];
	for (let i in elements) {
		html.push('<label>', elements[i].label, ': ');
		switch (elements[i].type) {
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
				'" max="', elements[i].max, '" value="', settings[i], '" required >');
			break;
		default:
			html.push('<input type="', elements[i].type, '" value="', settings[i], '" required />');
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
	let elements = dialogdata.data.desc.settings.elements;
	let settings = dialogdata.data.settings;
	let labels = dialog.firstElementChild.children;
	let nextdialog = null;
	for (let i in elements) {
		switch (elements[i].type) {
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
	case 'copy':
		buffers.push({ ...buffers[index], used: new Set() });
		elt.parentNode.insertBefore(elt.cloneNode(true), elt.parentNode.lastElementChild);
		break;
	case 'delete':
		for (let use of buffers[index].used) {
			let data = eltdata.get(use);
			data.settings[0] = { buffer: null, type: 'none' };
			data.desc.settings.apply(use, data.node, data.settings);
		}
		buffers.splice(index, 1);
		elt.parentNode.removeChild(elt);
		break;
	case 'raw':
	case 'file':
		let desc = nodes['buffer_' + event.target.dataset.type];
		dialog_make('New Audio Buffer', desc.settings.elements, []);
		dialogdata = { type: 'buffer', data: { desc: desc, settings: [] } };
		break;
	}
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
	startdata.paths.add(movedata.path);
	enddata.paths.add(movedata.path);
	connect(start, startdata.node, end, enddata.node);
	return true;
}

function connection_delete(path) {
	let data = eltdata.get(path);
	let startdata = eltdata.get(data.start.parentNode.parentNode);
	let enddata = eltdata.get(data.end.parentNode.parentNode);
	
	startdata.paths.delete(path);
	enddata.paths.delete(path);
	container.firstElementChild.removeChild(path);
	connect(data.start, startdata.node, data.end, enddata.node, true);
}

/* Menu buttons ***********************************************************************************/
document.getElementById('menu').addEventListener('mousedown', function menu_mousedown(event) {
	if (!event.target.dataset.type || event.target.dataset.type == 'buf') return;
	let elt = node_create(event.target.dataset.type, event.target.innerHTML);

	let offset = [
		container.offsetLeft + elt.offsetWidth/2,
		container.offsetTop + elt.offsetHeight/2,
	];
	
	elt.style.marginLeft = event.clientX + window.scrollX - offset[0] + 'px';
	elt.style.marginTop = event.clientY + window.scrollY - offset[1] + 'px';
	elt.style.zIndex = 1;

	movedata = {
		elt: elt,
		paths: new Set(),
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
	let node = desc.create ? desc.create(audioctx) : audioctx['create' + desc.name]();
	let elt = document.createElement('fieldset');
	
	let html = ['<legend><input type="text" value="', type, '"/></legend><div>'];
	if (desc.inputs == 1)
		html.push('<img src="icons.svg#circle" />');
	else if (desc.inputs > 1)
		html.push('<span class="multiple">', '<img src="icons.svg#circle">'.repeat(desc.inputs),
			'</span>');

	if (node instanceof AudioBufferSourceNode)
		html.push('<img src="icons.svg#none" data-type="settings" />');
	else if (node instanceof AudioScheduledSourceNode)
		html.push('<img src="icons.svg#play" data-type="start" />');
	html.push('<span>', name, '</span>');
	
	if (desc.outputs == 1)
		html.push('<img src="icons.svg#circle" />');
	else if (desc.outputs > 1)
		html.push('<span class="multiple">',
			'<img src="icons.svg#circle">'.repeat(desc.outputs), '</span>');
	
	if (desc.settings)
		html.push('<img src="icons.svg#settings" data-type="settings" />');
	if (node == audioctx.listener)
		html.push('<img src="icons.svg#pause" data-type="suspend" />');
	else
		html.push('<img src="icons.svg#delete" data-type="delete" />');
	html.push('</div>');
	
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
	
	let data = { node: node, paths: new Set(), desc: desc };
	if (desc.settings)
		data.settings = desc.settings.elements.map(e => e.initial);
	if (node instanceof AudioScheduledSourceNode) {
		let img = elt.children[1].firstElementChild;
		if (node instanceof AudioBufferSourceNode)
			node.onended = function() {
				node_reload(data, []);
				if (this.buffer != null) {
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
	
	return elt;
}

function node_reload(data, params, running) {
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
	
	for (let path of data.paths) {
		let pathdata = eltdata.get(path);
		let startdata = eltdata.get(pathdata.start.parentNode.parentNode);
		let enddata = eltdata.get(pathdata.end.parentNode.parentNode);
		let start = startdata.node, end = enddata.node;
		
		connect(pathdata.start, start, pathdata.end, end, true);
		if (start == data.node)
			start = node;
		if (end == data.node)
			end = node;
		if (!connect(pathdata.start, start, pathdata.end, end)) {
			container.firstElementChild.removeChild(path);
			startdata.paths.delete(path);
			enddata.paths.delete(path);
		}
	}
	
	node.onended = data.node.onended;
	if (running) {
		data.node.onended = null;
		data.node.stop();
	}
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
			if (data.node instanceof AudioBufferSourceNode)
				data.node.buffer = settings[0].buffer;
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
			for (let path of data.paths)
				connection_delete(path);
			if (elt.children[1].firstElementChild.dataset.type == 'stop') {
				data.node.onended = null;
				data.node.stop();
			}
			container.removeChild(elt);
			break;
		case 'settings':
			dialog_make(
				data.desc.name + ' ' + elt.firstElementChild.firstElementChild.value,
				data.desc.settings.elements,
				data.settings,
			);
			dialogdata = { type: 'settings', elt: elt, data: data };
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
(function init() {
	let elt = node_create('dest', 'Destination');
	elt.style.marginTop = '0px';
	elt.style.marginLeft = container.clientWidth - elt.offsetWidth - 10 + 'px';
})();