const nodes = {
    dest: {
        name: 'Destination',
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
            apply: (node, settings) => {
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
        create: ctx => ctx.destination,
    },
    cst: {
        name: 'Constant Source',
        type: 'ConstantSource',
        audioparams: {
            offset: {},
        },
    },
    osc: {
        name: 'Oscillator',
        type: 'Oscillator',
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
            apply: (node, settings, elt) => {
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
        name: 'Audio Buffer Source',
        type: 'BufferSource',
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
            apply: (node, settings, elt) => {
                let img = elt.children[1].lastElementChild;
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
        name: 'Media Element Source',
        type: 'MediaElementSource',
        settings: {
            elements: [
                { label: 'Source', type: 'file' },
            ],
            apply: (node, settings, elt) => {
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
        delete: node => URL.revokeObjectURL(node.mediaElement.src),
    },
    stream: {
        name: 'Media Stream Source',
        type: 'MediaStreamSource',
        settings: {
            elements: [
                { label: 'Source', type: 'mediastream', initial: {} },
            ],
            apply: () => {}
        },
        create: (ctx, node) => {
            // Request permission
            navigator.mediaDevices
                .getUserMedia({ audio: true })
                .then(stream => {
                    node.settings[0].stream = stream;
                    node.reload([stream])
                });
            // Fake node as it's hard to have an empty track
            return ctx.createConstantSource();
        },
    },
    strdest: {
        name: 'Media Stream Destination',
        type: 'MediaStreamDestination',
        settings: {
            elements: [
                { label: 'MIME type', type: 'text', optional: true },
                { label: 'Bitrate', type: 'number', optional: true },
            ],
            apply: (node, settings, elt) => {
                settings[2] && settings[2].stop();
                
                // Create new node
                let params = {}
                if (settings[0])
                    params.mimeType = settings[0];
                if (settings[1])
                    params.audioBitsPerSecond = settings[1];
                settings[2] = new MediaRecorder(node.stream, params);

                // Update UI and save record
                let imgs = elt.children[1].children;
                settings[2].ondataavailable = evt => {
                    imgs[6].src = imgs[6].src.replace(/#.*$/, '#rec');
                    imgs[6].dataset.type = 'recstart';
                    imgs[5].src = imgs[5].src.replace(/#.*$/, '#none');
                    imgs[5].dataset.type = '';
                    
                    open(URL.createObjectURL(evt.data));
                }
            },
        }
    },
    gain: {
        name: 'Gain',
        type: 'Gain',
        audioparams: {
            gain: {},
        },
    },
    delay: {
        name: 'Delay',
        type: 'Delay',
        audioparams: {
            delayTime: {},
        },
        settings: {
            elements: [
                { label: 'Maximum time', type: 'number', min: 0, max: 180, initial: 1 },
            ],
            apply: (node, settings, elt) => {
                elt.lastElementChild.lastElementChild.lastElementChild.max = settings[0];
                return [settings[0]];
            },
        },
    },
    stereo: {
        name: 'Stereo Panner',
        type: 'StereoPanner',
        audioparams: {
            pan: {},
        },
    },
    panner: {
        name: 'Panner',
        type: 'Panner',
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
        name: 'Biquad Filter',
        type: 'BiquadFilter',
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
            apply: (node, settings, elt, paths) => {
                // Initialize
                if(!settings[3]) {
                    settings[3] = {
                        magn: new Float32Array(animate.frequencies.length),
                        phase: new Float32Array(animate.frequencies.length),
                    }
                    let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    svg.innerHTML = '<path/>';
                    settings[4] = [svg, svg.cloneNode(true), svg.cloneNode(true)];
                    settings[4].forEach(svg => elt.appendChild(svg));
                }
                // Register visualisations
                if (settings[0] || settings[1] || settings[2])
                    animate.filter.set(node, settings);
                else
                    animate.filter.delete(node);
                for (let i = 0; i < 3; i++)
                    settings[4][i].style.display = settings[i] ? '' : 'none';
                // Size may have changed: redraw paths
                paths.forEach(path => path.redraw());
            },
        },
        delete: node => animate.filter.delete(node),
    },
    iir: {
        name: 'IIR Filter',
        type: 'IIRFilter',
        settings: {
            elements: [
                { label: 'Feedforward', type: 'textarea'},
                { label: 'Feedback', type: 'textarea'},
                { label: 'Show linear magnitude response', type: 'checkbox' },
                { label: 'Show logarithmic magnitude response', type: 'checkbox' },
                { label: 'Show frequency phase response', type: 'checkbox' },
            ],
            apply: (node, settings, elt, paths) => {
                // Initialize
                if(!settings[5]) {
                    settings[5] = {
                        magn: new Float32Array(animate.frequencies.length),
                        phase: new Float32Array(animate.frequencies.length),
                    }
                    let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    svg.innerHTML = '<path/>';
                    settings[6] = [svg, svg.cloneNode(true), svg.cloneNode(true)];
                    settings[6].forEach(svg => elt.appendChild(svg));
                }
                // Unregister visualisations for the node to be replaced
                animate.filter.delete(node);
                // Update visualisations visibility
                for (let i = 0; i < 3; i++)
                    settings[6][i].style.display = settings[i + 2] ? '' : 'none';
                // Size may have changed: redraw paths
                paths.forEach(path => path.redraw());
                return [settings[0].split(','), settings[1].split(',')];
            },
            reload: (oldnode, newnode, settings) => {
                // Register visualisations with the new node
                if (settings[2] || settings[3] || settings[4])
                    animate.filter.set(newnode, settings.slice(2));
            },
        },
        create: ctx => ctx.createIIRFilter([1], [1]),
        delete: node => animate.filter.delete(node),
    },
    compr: {
        name: 'Dynamics Compressor',
        type: 'DynamicsCompressor',
        audioparams: {
            threshold: {},
            knee: {},
            ratio: {},
            attack: {},
            release: {},
        },
        settings: {
            elements: [
                { label: 'Show reduction', type: 'checkbox' },
            ],
            apply: (node, settings, elt, paths) => {
                // Initialize
                if(!settings[1]) {
                    settings[1] = document.createElement('div');
                    settings[1].innerHTML = '<label>reduction: <input disabled style="color:#000"></label>';
                    elt.appendChild(settings[1]);
                }
                // Register visualisations
                if (settings[0]) {
                    animate.compr.set(node, settings);
                    settings[1].style.display = '';
                } else {
                    animate.compr.delete(node);
                    settings[1].style.display = 'none';
                }
                // Size may have changed: redraw paths
                paths.forEach(path => path.redraw());
            },
        },
        delete: node => animate.compr.delete(node),
    },
    conv: {
        name: 'Convolver',
        type: 'Convolver',
        booleanparams: {
            normalize: true,
        },
        settings: {
            elements: [
                { label: 'Audio Buffer', type: 'buffer' },
            ],
            apply: (node, settings) => {
                if (settings[0].type != 'new') node.buffer = settings[0].buffer;
            },
        },
    },
    shaper: {
        name: 'Wave Shaper',
        type: 'WaveShaper',
        discreteparams: {
            oversample: ['none', '2x', '4x'],
        },
        settings: {
            elements: [
                { label: 'Curve', type: 'textarea'},
            ],
            apply: (node, settings) => { node.curve = new Float32Array(settings[0].split(',')); }
        },
    },
    split: {
        name: 'Channel Splitter',
        type: 'ChannelSplitter',
        settings: {
            elements: [
                { label: 'Outputs', type: 'number', min: 1, initial: 6 },
            ],
            apply: (node, settings, elt) => {
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
        name: 'Channel Merger',
        type: 'ChannelMerger',
        settings: {
            elements: [
                { label: 'Inputs', type: 'number', min: 1, initial: 6 },
            ],
            apply: (node, settings, elt) => {
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
        type: 'Analyser',
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
            apply: (node, settings, elt, paths) => {
                // Initialize
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
                // Register visualisations
                if (settings[0] || settings[1])
                    animate.analy.set(node, settings);
                else
                    animate.analy.delete(node);
                for (let i = 0; i < 2; i++)
                    settings[3][i].style.display = settings[i] ? '' : 'none';
                // Size may have changed: redraw paths
                paths.forEach(path => path.redraw());
            },
        },
        delete: node => animate.analy.delete(node),
    },
};
