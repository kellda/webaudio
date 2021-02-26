const nodes = {
	dest: {
		name: 'Destination',
		inputs: 1,
		outputs: 0,
		settings: {
			// Waiting for Firefox to implement these as AudioParams
			// https://bugzilla.mozilla.org/show_bug.cgi?id=1283029
			elements: [
				{ label: 'postitionX', type: 'number', initial: 0 },
				{ label: 'postitionY', type: 'number', initial: 0 },
				{ label: 'postitionZ', type: 'number', initial: 0 },
				{ label: 'forwardX', type: 'number', initial: 0 },
				{ label: 'forwardY', type: 'number', initial: 0 },
				{ label: 'forwardZ', type: 'number', initial: -1 },
				{ label: 'upX', type: 'number', initial: 0 },
				{ label: 'upY', type: 'number', initial: 1 },
				{ label: 'upZ', type: 'number', initial: 0 },
			],
			apply: (elt, node, settings) => {
				if (node.positionX) {
					node.positionX.value = settings[0];
					node.positionY.value = settings[1];
					node.positionZ.value = settings[2];
				} else {
					node.setPosition(settings[0], settings[1], settings[2]);
				}
				if (node.forwardX) {
					node.forwardX.value = settings[3];
					node.forwardY.value = settings[4];
					node.forwardZ.value = settings[5];
					node.upX.value = settings[6];
					node.upY.value = settings[7];
					node.upZ.value = settings[8];
				} else {
					node.setOrientation(settings[3], settings[4], settings[5], settings[6], settings[7], settings[8]);
				}
			},
		},
		create: ctx => ctx.listener,
	},
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
			type: ['sine', 'square', 'sawtooth', 'triangle', ['custom', 'hidden']],
		},
		settings: {
			elements: [
				{ label: 'Real / Cosine / A terms', type: 'textarea'},
				{ label: 'Imag / Sine / B terms', type: 'textarea'},
				{ label: 'Disable normalisation', type: 'checkbox' },
			],
			apply: (elt, node, settings) => {
				let real = new Float32Array(settings[0].split(','));
				let imag = new Float32Array(settings[1].split(','));
				settings[3] = node.context.createPeriodicWave(real, imag, { disableNormalization: settings[2] });
				node.setPeriodicWave(settings[3]);
				elt.lastElementChild.lastElementChild.lastElementChild.lastElementChild.selected = true;
			},
			reload: (oldnode, newnode, settings) => {
				if (oldnode.type == 'custom') {
					newnode.setPeriodicWave(settings[3]);
				} else
					newnode.type = oldnode.type;
			}
		},
	},
	buffer: {
		name: 'BufferSource',
		inputs: 0,
		outputs: 1,
		audioparams: {
			detune: {},
			playbackRate: {},
		},
		continuousparams: {
			loopStart: { min: '', max: '', initial: 0 },
			loopEnd: { min: '', max: '', initial: 0 },
		},
		booleanparams: {
			loop: false,
		},
		settings: {
			elements: [
				{ label: 'Audio Buffer', type: 'buffer' },
			],
			apply: (elt, node, settings) => {
				let img = elt.children[1].firstElementChild;
				switch (settings[0].type) {
				case 'none':
						img.src = img.src.replace(/#.*$/, '#none');
						img.dataset.type = 'settings';
						node.buffer = null;
						return;
				case 'loading':
						img.src = img.src.replace(/#.*$/, '#loading');
						img.dataset.type = '';
						node.buffer = null;
						return;
				case 'loaded':
						img.src = img.src.replace(/#.*$/, '#play');
						img.dataset.type = 'start';
						return;
				case 'new':
						return;
				}
			},
		},
	},
	buffer_raw: {
		settings: {
			elements: [
				{ label: 'Name', type: 'text' },
				{ label: 'Raw data (one line per channel)', type: 'textarea'},
				{ label: 'Sample rate', type: 'number' },
			],
			make: (ctx, settings) => {
				let channels = settings[1].split('\n');
				let buffer = ctx.createBuffer(
					channels.length,
					channels[0].split(',').length,
					settings[2],
				);
				for (let i in channels)
					buffer.copyToChannel(new Float32Array(channels[i].split(',')), i);
				return Promise.resolve(buffer);
			},
		},
	},
	buffer_file: {
		settings: {
			elements: [
				{ label: 'Name', type: 'text' },
				{ label: 'File', type: 'file'},
			],
			make: (ctx, settings) => settings[1].arrayBuffer().then(buffer => ctx.decodeAudioData(buffer)),
		},
	},
	media: {
		name: 'MediaElementSource',
		inputs: 0,
		outputs: 1,
		settings: {
			elements: [
				{ label: 'Source', type: 'file' },
			],
			apply: (elt, node, settings) => {
				URL.revokeObjectURL(node.mediaElement.src);
				node.mediaElement.src = URL.createObjectURL(settings[0]);
				elt.appendChild(node.mediaElement);
			},
		},
		create: ctx => {
			let elt = document.createElement('audio');
			elt.controls = true;
			return ctx.createMediaElementSource(elt);
		},
		delete: node => {
			URL.revokeObjectURL(node.mediaElement.src);
		}
	},
	stream: {
		name: 'MediaStreamSource',
		inputs: 0,
		outputs: 1,
		settings: {
			elements: [
				{ label: 'Source', type: 'mediastream', initial: {} },
			],
			apply: () => {}
		},
		create: (ctx, elt) => {
			// Request permission
			navigator.mediaDevices
				.getUserMedia({ audio: true })
				.then(stream => {
					eltdata.get(elt).settings[0].stream = stream;
					node_reload(eltdata.get(elt), [stream])
				});
			// Fake node as it's hard to have an empty track
			return ctx.createGain();
		},
		delete: node => {}
	},
	strdest: {
		name: 'MediaStreamDestination',
		inputs: 1,
		outputs: 0,
		todo: { stream: MediaStream },
	},
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
		settings: {
			elements: [
				{ label: 'Maximum time', type: 'number', min: 0, max: 180, initial: 1 },
			],
			apply: (elt, node, settings) => {
				elt.lastElementChild.lastElementChild.lastElementChild.max = settings[0];
				return [settings[0]];
			},
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
			distanceModel: ['linear', ['inverse', 'selected'], 'exponential'],
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
			type: ['lowpass', 'highpass', 'bandpass', 'lowshelf', 'highshelf', 'peaking', 'notch', 'allpass'],
		},
		settings: {
			elements: [
				{ label: 'Show linear magnitude response', type: 'checkbox' },
				{ label: 'Show logarithmic magnitude response', type: 'checkbox' },
				{ label: 'Show frequency phase response', type: 'checkbox' },
			],
			apply: (elt, node, settings) => {
				if(!settings[3]) {
					settings[3] = {
						magn: new Float32Array(frequencies.length),
						phase: new Float32Array(frequencies.length),
					}
					let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
					svg.innerHTML = '<path/>';
					settings[4] = [svg, svg.cloneNode(true), svg.cloneNode(true)];
					settings[4].forEach(svg => elt.appendChild(svg));
				}
				if (settings[0] || settings[1] || settings[2])
					animate.biquad.set(node, settings);
				else
					animate.biquad.delete(node);
				for (let i = 0; i < 3; i++)
					settings[4][i].style.display = settings[i] ? '' : 'none';
			},
		},
	},
	iir: {
		name: 'IIRFilter',
		inputs: 1,
		outputs: 1,
		settings: {
			elements: [
				{ label: 'Feedforward', type: 'textarea'},
				{ label: 'Feedback', type: 'textarea'},
				{ label: 'Show frequency response', type: 'checkbox', todo: true },
			],
			apply: (elt, node, settings) => [settings[0].split(','), settings[1].split(',')],
		},
		create: ctx => ctx.createIIRFilter([1], [1]),
	},
	compr: {
		name: 'DynamicsCompressor',
		inputs: 1,
		outputs: 1,
		audioparams: {
			threshold: {},
			knee: {},
			ratio: {},
			attack: {},
			release: {},
		},
		todo: { reduction: 'read' },
	},
	conv: {
		name: 'Convolver',
		inputs: 1,
		outputs: 1,
		booleanparams: {
			normalize: true,
		},
		settings: {
			elements: [
				{ label: 'Audio Buffer', type: 'buffer' },
			],
			apply: (elt, node, settings) => {
				if (settings[0].type != 'new') node.buffer = settings[0].buffer;
			},
		},
	},
	shaper: {
		name: 'WaveShaper',
		inputs: 1,
		outputs: 1,
		discreteparams: {
			oversample: ['none', '2x', '4x'],
		},
		settings: {
			elements: [
				{ label: 'Curve', type: 'textarea'},
			],
			apply: (elt, node, settings) => { node.curve = new Float32Array(settings[0].split(',')); }
		},
	},
	split: {
		name: 'ChannelSplitter',
		inputs: 1,
		outputs: 6,
		settings: {
			elements: [
				{ label: 'Outputs', type: 'number', min: 1, initial: 6 },
			],
			apply: (elt, node, settings) => {
				let list = elt.children[1].children[2];
				if (list.childElementCount < settings[0]) {
					let img = list.firstElementChild;
					while (list.childElementCount < settings[0])
						list.appendChild(img.cloneNode());
				} else {
					while (list.childElementCount > settings[0])
						list.removeChild(list.lastElementChild);
				}
				return [settings[0]];
			},
		},
	},
	merger: {
		name: 'ChannelMerger',
		inputs: 6,
		outputs: 1,
		settings: {
			elements: [
				{ label: 'Inputs', type: 'number', min: 1, initial: 6 },
			],
			apply: (elt, node, settings) => {
				let list = elt.children[1].children[0];
				if (list.childElementCount < settings[0]) {
					let img = list.firstElementChild;
					while (list.childElementCount < settings[0])
						list.appendChild(img.cloneNode());
				} else {
					while (list.childElementCount > settings[0])
						list.removeChild(list.lastElementChild);
				}
				return [settings[0]];
			},
		},
	},
	analy: {
		name: 'Analyser',
		inputs: 1,
		outputs: 1,
		continuousparams: {
			minDecibels: { min: '', max: 0, initial: -100 },
			maxDecibels: { min: '', max: 0, initial: -30 },
			smoothingTimeConstant: { min: 0, max: 1, initial: 0.8 },
			},
		discreteparams: {
			fftSize: ['32', '64', '128', '256', '512', '1024', ['2048', 'selected'], '4096', '8192', '16384', '32768'],
		},
		settings: {
			elements: [
				{ label: 'Show frequency data', type: 'checkbox' },
				{ label: 'Show time domain data', type: 'checkbox' },
			],
			apply: (elt, node, settings) => {
				if(!settings[2]) {
					settings[2] = {
						freq: new Uint8Array(16384),
						time: new Uint8Array(32768),
					}
					let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
					svg.innerHTML = '<path/>';
					settings[3] = [svg, svg.cloneNode(true)];
					settings[3].forEach(svg => elt.appendChild(svg));
				}
				if (settings[0] || settings[1])
					animate.analy.set(node, settings);
				else
					animate.analy.delete(node);
				for (let i = 0; i < 2; i++)
					settings[3][i].style.display = settings[i] ? '' : 'none';
			},
		},
		todo: { get__Data: ['Float', 'Byte', 'Frequency', 'TimeDomain'] },
	},
};
