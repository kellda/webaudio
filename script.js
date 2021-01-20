'use strict';

window.addEventListener('error', function (event) {
	let msg = document.createElement('p');
	console.log(event);
	msg.textContent = event.message;
	document.getElementById('log').appendChild(msg);
});

//(function() {
	const nodes = {
		osc: {
			name: 'Oscillator',
			inputs: 0,
			outputs: 1,
			audioparams: {
				frequency: {},
				detune: {},
			},
			discreteparams: {
				type: ['sine', 'square', 'sawtooth', 'triangle', 'custom'],
			},
		},
	};
	
	let audioctx = new AudioContext();
	let domctx = document.getElementById('context');
	let linksctx = document.getElementById('links');
	
	let nextpos = { x: domctx.firstElementChild.offsetWidth + 10, y: 0 };
	
	document.getElementById('menu').addEventListener('click', function create(event) {
		console.log(event);
		let type = event.target.dataset.type;
		if (!type) return;
		
		let node = nodes[type];
		let audio = audioctx['create' + node.name]();
		let box = document.createElement('fieldset');
		
		let html = ['<legend><input type="text" value="', type, '"/></legend><div>'];
		if (node.inputs)
			html.push('<img src="icons.svg#circle" />');
		html.push('<span>', node.name, '</span>');
		if (node.outputs)
			html.push('<img src="icons.svg#circle" />');
		html.push('<img src="icons.svg#settings" /></div>');
		
		for (let param in node.audioparams) {
			html.push(
				'<div><img src="icons.svg#circle"/><label>', param, ': ',
				'<input type="number" step="any" min="', audio[param].minValue ,
				'" max="', audio[param].maxVaue ,'" value="', audio[param].value,
				'"/></label></div>'
			);
		}
		
		for (let param in node.discreteparams) {
			html.push('<div><label>', param, ': <select>');
			node.discreteparams[param].forEach(opt => html.push('<option>', opt, '</option>'));
			html.push('</select></label></div>');
		}
		
		box.innerHTML = html.join('');
		box.style.left = nextpos.x + 'px';
		box.style.top = nextpos.y + 'px';
		domctx.appendChild(box);
		nextpos.x += box.offsetWidth + 10;
		if (nextpos.x > domctx.clientWidth) {
			nextpos.x = 0;
			nextpos.y += 150;
			if (nextpos.y + 100 > domctx.clientHeight) {
				nextpos.y = 0;
			}
			box.style.left = '0px';
			box.style.top = nextpos.y + 'px';
			nextpos.x += box.offsetWidth + 10;
		}
		audio.start();
	});
	
	domctx.addEventListener('input', console.log);
	domctx.addEventListener('change', console.log);
	
	domctx.addEventListener('click', function click(event) {
		console.log(event);
	});
	
	let dragdata = null, condata = null;
	const svgns = 'http://www.w3.org/2000/svg';
	
	function drag(event) {
		dragdata.elt.style.left = dragdata.x + event.clientX + window.scrollX + 'px';
		dragdata.elt.style.top = dragdata.y + event.clientY + window.scrollY + 'px';
	}
	
	function connect(event) {
		condata.path.setAttribute('d', `M${condata.startx},${condata.starty} ${event.clientX + window.scrollX},${event.clientY + window.scrollY}`);
	}
	
	domctx.addEventListener('mousedown', function mousedown(event) {
		let elt = event.target;
		let tag = elt.nodeName.toLowerCase();
		if (elt == domctx || tag == 'input' || tag == 'select') return;
		
		if (tag == 'img') {
			let path = document.createElementNS(svgns, 'path');
			linksctx.appendChild(path);
			let rect = elt.getBoundingClientRect();
			condata = {
				from: elt,
				path: path,
				startx: (rect.left + rect.right) / 2,
				starty: (rect.top + rect.bottom) / 2,
			};
			console.log(condata);
			document.addEventListener('mousemove', connect);
		} else {
			while (elt.nodeName.toLowerCase() != 'fieldset') elt = elt.parentNode;
			dragdata = {
				elt: elt,
				x: elt.offsetLeft - event.clientX - window.scrollX,
				y: elt.offsetTop - event.clientY - window.scrollY,
			};
			document.addEventListener('mousemove', drag);
		}
		event.preventDefault();
	});
	
	document.addEventListener('mouseup', function mouseup(event) {
		if (dragdata) {
			document.removeEventListener('mousemove', drag);
			dragdata = null;
		}
		if (condata) {
			document.removeEventListener('mousemove', connect);
			condata = null;
		}
	});
//})();