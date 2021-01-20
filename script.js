'use strict';

(function() {
	const nodes = {
		cst: {
			name: 'ConstantSource',
			inputs: 0,
			outputs: 1,
			audioparams: {
				offset: {},
			},
		},
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
		buffer: 'TODO',
		gain: {
			name: 'Gain',
			inputs: 1,
			outputs: 1,
			audioparams: {
				gain: {},
			},
		},
		delay: {
			name: 'Delay',
			inputs: 1,
			outputs: 1,
			audioparams: {
				delayTime: {},
			},
		},
		stereo: {
			name: 'StereoPanner',
			inputs: 1,
			outputs: 1,
			audioparams: {
				pan: {},
			},
		},
		panner: {
			name: 'Panner',
			inputs: 1,
			outputs: 1,
			audioparams: {
				orientationX: {},
				orientationY: {},
				orientationZ: {},
				positionX: {},
				positionY: {},
				positionZ: {},
			},
			continuousparams: {
				coneInnerAngle: { min: '', max: '', initial: 360 },
				coneOuterAngle: { min: '', max: '', initial: 0 },
				coneOuterGain: { min: 0, max: 1, initial: 0 },
				maxDistance: { min: 0, max: '', initial: 10000 },
				refDistance: { min: 0, max: '', initial: 1 },
				rolloffFactor: { min: 0, max: '', initial: 1 },
			},
			discreteparams: {
				distanceModel: ['inverse', 'linear', 'exponential'],
				panningModel: ['equalpower', 'HRTF'],
			},
		},
		biquad: {
			name: 'BiquadFilter',
			inputs: 1,
			outputs: 1,
			audioparams: {
				frequency: {},
				detune: {},
				Q: {},
				gain: {},
			},
			discreteparams: {
				type: [
					'lowpass', 'highpass', 'band-pass',
					'low-shelf', 'high-shelf', 'peaking',
					'notch', 'all-pass',
				],
			},
		},
		iif: 'TODO',
		compr: {
			name: 'DynamicsCompressor',
			inputs: 1,
			output: 1,
			audioparams: {
				threshold: {},
				knee: {},
				ratio: {},
				attack: {},
				release: {},
			},
		},
		shaper: 'TODO',
		merger: 'TODO',
		split: 'TODO',
		analy: 'TODO',
	};
	
	let audioctx = new AudioContext();
	let container = document.getElementById('container');
	let eltdata = new WeakMap();
	eltdata.set(container.children[1], { audio: audioctx.destination, paths: [] })
	
	let nextpos = { x: container.children[1].offsetWidth + 10, y: 0 };
	
	document.getElementById('menu').addEventListener('click', function create(event) {
		let type = event.target.dataset.type;
		if (!type) return;
		
		let node = nodes[type];
		let audio = audioctx['create' + node.name]();
		let box = document.createElement('fieldset');
		
		let html = ['<legend><input type="text" value="', type, '"/></legend><div>'];
		if (node.inputs)
			html.push('<img src="icons.svg#circle" />');
		html.push('<span>', event.target.innerHTML, '</span>');
		if (node.outputs)
			html.push('<img src="icons.svg#circle" />');
		html.push('<img src="icons.svg#settings" data-type="settings" /></div>');
		
		for (let param in node.audioparams || {}) {
			html.push(
				'<div data-param="', param, '"><img src="icons.svg#circle" /><label>', param, ': ',
				'<input type="number" step="any" min="', audio[param].minValue,
				'" max="', audio[param].maxVaue, '" value="', audio[param].value,
				'"/></label></div>'
			);
		}
		
		for (let param in node.continuousparams || {}) {
			let range = node.continuousparams[param];
			html.push(
				'<div data-param="', param, '"><label>', param, ': ',
				'<input type="number" step="any" min="', range.min,
				'" max="', range.max,'" value="', range.initial,
				'"/></label></div>'
			);
		}
		
		for (let param in node.discreteparams || {}) {
			html.push('<div data-param="', param, '"><label>', param, ': <select>');
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
			if (nextpos.y + 100 > container.clientHeight)
				nextpos.y = 0;
			box.style.marginLeft = '0px';
			box.style.marginTop = nextpos.y + 'px';
			nextpos.x += box.offsetWidth + 10;
		}
		eltdata.set(box, { audio: audio, paths: [] });
		if (audio.start)
			audio.start();
	});
	
	container.addEventListener('input', function input(event) {
		let tag = event.target.nodeName.toLowerCase();
		if (tag != 'input' && tag != 'select') return;
		let elt = event.target.parentNode.parentNode;
		let param = elt.dataset.param;
		let node = eltdata.get(elt.parentNode).audio;
		if (node[param] instanceof AudioParam)
			node[param].value = event.target.value;
		else
			node[param] = event.target.value;
	});
	
	function deletePath(path) {
		let data = eltdata.get(path);
		let startdata = eltdata.get(data.start.parentNode.parentNode);
		let enddata = eltdata.get(data.end.parentNode.parentNode);
		
		startdata.paths.splice(startdata.paths.indexOf(path), 1);
		enddata.paths.splice(enddata.paths.indexOf(path), 1);
		container.firstElementChild.removeChild(path);
		
		let endparam = data.end.parentNode.dataset.param;
		startdata.audio.disconnect(endparam ? enddata.audio[endparam] : enddata.audio);
	}
	
	container.addEventListener('click', function click(event) {
		let tag = event.target.nodeName.toLowerCase();
		if (tag == 'path')
			deletePath(event.target);
		if (tag == 'img' && event.target.dataset.type == 'settings') {
			let elt = event.target.parentNode.parentNode;
			let data = eltdata.get(elt);
			while(data.paths.length)
				deletePath(data.paths[0]);
			if (data.audio.stop)
				data.audio.stop();
			container.removeChild(elt);
		}
	});
	
	let dragdata = null, condata = null;
	const svgns = 'http://www.w3.org/2000/svg';
	
	function drawPath(path, x1, y1, x2, y2) {
		path.setAttribute('d', `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`);
		//path.setAttribute('d', `M${x1},${y1} C${x1},${Math.min(y1,y2) - 50} ${x2},${Math.min(y1,y2) - 50} ${x2},${y2}`);
	}
	
	function drag(event) {
		dragdata.elt.style.marginLeft = dragdata.x + event.clientX + window.scrollX + 'px';
		dragdata.elt.style.marginTop = dragdata.y + event.clientY + window.scrollY + 'px';
		for (let path of dragdata.paths) {
			let data = eltdata.get(path);
			drawPath(path,
				data.start.offsetLeft + data.start.offsetWidth / 2,
				data.start.offsetTop + data.start.offsetHeight / 2,
				data.end.offsetLeft + data.end.offsetWidth / 2,
				data.end.offsetTop + data.end.offsetHeight / 2,
			);
		}
	}
	
	function connect(event) {
		drawPath(condata.path, condata.startx, condata.starty,
			event.clientX + window.scrollX - container.offsetLeft,
			event.clientY + window.scrollY - container.offsetTop,
		);
	}
	
	container.addEventListener('mousedown', function mousedown(event) {
		let elt = event.target;
		let tag = elt.nodeName.toLowerCase();
		if (elt == container || tag == 'input' || tag == 'select'  || tag == 'path' || elt.dataset.type) return;
		event.preventDefault();
		
		if (tag == 'img') {
			let path = document.createElementNS(svgns, 'path');
			container.firstElementChild.appendChild(path);
			container.className = 'connect';
			condata = {
				from: elt,
				path: path,
				startx: elt.offsetLeft + elt.offsetWidth / 2,
				starty: elt.offsetTop + elt.offsetHeight / 2,
			};
			document.addEventListener('mousemove', connect);
		} else {
			while (elt.nodeName.toLowerCase() != 'fieldset') elt = elt.parentNode;
			dragdata = {
				elt: elt,
				x: elt.offsetLeft - event.clientX - window.scrollX,
				y: elt.offsetTop - event.clientY - window.scrollY,
				paths: eltdata.get(elt).paths,
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
			let ok = (function() {
				if (event.target.nodeName.toLowerCase() != 'img') return false;
				let start, end;
				if (condata.from.previousElementSibling)
					start = condata.from;
				else
					end = condata.from;
				if (event.target.previousElementSibling)
					start = event.target;
				else
					end = event.target;
				if (!start || !end) return false;
				
				eltdata.set(condata.path, { start: start, end: end });
				drawPath(condata.path,
					start.offsetLeft + start.offsetWidth / 2,
					start.offsetTop + start.offsetHeight / 2,
					end.offsetLeft + end.offsetWidth / 2,
					end.offsetTop + end.offsetHeight / 2,
				);
				
				let startdata = eltdata.get(start.parentNode.parentNode);
				let enddata = eltdata.get(end.parentNode.parentNode);
				startdata.paths.push(condata.path);
				enddata.paths.push(condata.path);
				
				let endparam = end.parentNode.dataset.param;
				startdata.audio.connect(endparam ? enddata.audio[endparam] : enddata.audio);
				
				return true;
			})();
			
			if (!ok) container.firstElementChild.removeChild(condata.path);
			document.removeEventListener('mousemove', connect);
			container.className = '';
			condata = null;
		}
	});
})();
