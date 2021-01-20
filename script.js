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
	let container = document.getElementById('container');
	
	let nextpos = { x: container.children[1].offsetWidth + 10, y: 0 };
	
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
		box.style.marginLeft = nextpos.x + 'px';
		box.style.marginTop = nextpos.y + 'px';
		container.appendChild(box);
		nextpos.x += box.offsetWidth + 10;
		if (nextpos.x > container.clientWidth) {
			nextpos.x = 0;
			nextpos.y += 150;
			if (nextpos.y + 100 > container.clientHeight) {
				nextpos.y = 0;
			}
			box.style.marginLeft = '0px';
			box.style.marginTop = nextpos.y + 'px';
			nextpos.x += box.offsetWidth + 10;
		}
		audio.start();
	});
	
	container.addEventListener('input', console.log);
	container.addEventListener('change', console.log);
	
	container.addEventListener('click', function click(event) {
		console.log(event);
	});
	
	let dragdata = null, condata = null;
	const svgns = 'http://www.w3.org/2000/svg';
	
	function path(x1, y1, x2, y2) {
		return `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;//
		//return `M${x1},${y1} C${x1},${Math.min(y1,y2) - 50} ${x2},${Math.min(y1,y2) - 50} ${x2},${y2}`;
	}
	
	function drag(event) {
		dragdata.elt.style.marginLeft = dragdata.x + event.clientX + window.scrollX + 'px';
		dragdata.elt.style.marginTop = dragdata.y + event.clientY + window.scrollY + 'px';
	}
	
	function connect(event) {
		condata.path.setAttribute('d', path(
			condata.startx,
			condata.starty,
			event.clientX + window.scrollX - container.offsetLeft,
			event.clientY + window.scrollY - container.offsetTop,
		));
	}
	
	container.addEventListener('mousedown', function mousedown(event) {
		let elt = event.target;
		let tag = elt.nodeName.toLowerCase();
		if (elt == container || tag == 'input' || tag == 'select') return;
		event.preventDefault();
		
		if (tag == 'path') {
			console.log(event);
		} else if (tag == 'img') {
			let path = document.createElementNS(svgns, 'path');
			container.firstElementChild.appendChild(path);
			condata = {
				from: elt,
				path: path,
				startx: elt.offsetLeft + elt.offsetWidth / 2,
				starty: elt.offsetTop + elt.offsetHeight / 2,
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
