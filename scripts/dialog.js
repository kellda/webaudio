'use strict';

const dialog = (() => {
    let elt = document.getElementById('dialog');
    return {
        elt: elt.firstElementChild,
        style: elt.style, 
        data: {},
        buffers: [],
        mdn: document.getElementById('mdninfo'),
    };
})();

dialog.make = function(name, elements, settings) {
    let html = ['<div>', name, '<img src="icons.svg#close" data-type="close" /></div>'];
    for (let i in elements) {
        html.push('<label>', elements[i].label, ': ');
        switch (elements[i].type) {
        case 'mediastream':
            html.push('<select required></select>');
            navigator.mediaDevices.enumerateDevices().then(devices => {
                let html = [];
                for (let d of devices) if(d.kind == 'audioinput') {
                    html.push('<option value="', d.deviceId, '"',
                        settings[i].id == d.deviceId ? ' selected' : '', '>', d.label, '</option>');
                }
                dialog.elt.children[1].lastElementChild.innerHTML = html.join('');
            })
            break;
        case 'buffer':
            html.push('<select><option value="null">(none)</option>');
            for (let b in dialog.buffers) {
                html.push('<option value="', b, '"',
                    settings[i] == dialog.buffers[b] ? ' selected' : '', 
                    '>', dialog.buffers[b].name, '</option>');
            }
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
    dialog.elt.innerHTML = html.join('');
    dialog.style.display = 'flex';
};

dialog.submit = function(event) {
    event.preventDefault();
    if (dialog.data.type == 'param') {
        let elts = dialog.elt.children;
        let points = [];
        let range = [-Infinity, Infinity, -Infinity];
        for (let elt of elts) {
            if (elt.firstElementChild.type != 'number') continue;
            let point = [+elt.children[0].value, elt.children[1].value,
                +elt.children[2].value, +elt.children[3].value];
            if (point[0] > range[0]) range[0] = point[0];
            if (point[2] < range[1]) range[1] = point[2];
            if (point[2] > range[2]) range[2] = point[2];
            points.push(point);
        }
        points.sort((a, b) => a[0] - b[0]);
        dialog.data.data.points = points;
        dialog.data.data.range = range;
        ui.param_draw(dialog.data.elt, dialog.data.data);
        dialog.style.display = 'none';
        return;
    }
    let elements = dialog.data.data.desc.settings.elements;
    let settings = dialog.data.data.settings;
    let labels = dialog.elt.children;
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
                    dialog.data.data.reload([stream]);
                });
            break;
        case 'buffer':
            if (settings[i] && settings[i].used)
                settings[i].used.delete(dialog.data.data);
            let value = labels[+i+1].lastElementChild.value;
            switch (value) {
            case 'raw':
            case 'file':
                let desc = nodes['buffer_' + value];
                dialog.make('New Audio Buffer', desc.settings.elements, []);
                nextdialog = {
                    type: 'buffer',
                    data: { desc: desc, settings: [] },
                    node: dialog.data.data,
                };
                settings[i] = { buffer: null, type: 'new' };
                break;
            case 'null':
                settings[i] = { buffer: null, type: 'none' };
                break;
            default:
                settings[i] = dialog.buffers[value];
                dialog.buffers[value].used.add(dialog.data);
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
    switch (dialog.data.type) {
    case 'settings':
        dialog.data.data.apply(
            dialog.data.data.elt.children[1].lastElementChild.dataset.type == 'stop');
        break;
    case 'buffer':
        let buffer = dialog.data.data.desc.settings.make(core.audioctx, dialog.data.data.settings);
        let data = { name: settings[0], buffer: null, type: 'loading', used: new Set() };
        if (dialog.data.node) {
            let node = dialog.data.node;
            if (node.settings[0] && node.settings[0].used)
                node.settings[0].used.delete(node);
            node.settings[0] = data;
            data.used.add(node);
            node.apply();
        }
        buffer.then(buffer => {
            data.buffer = buffer;
            data.type = 'loaded';
            data.used.forEach(use => use.apply());
        });
        if (dialog.data.id != undefined) {
            data.used = dialog.buffers[dialog.data.id].used;
            for (let use of data.used) {
                use.settings[0] = data;
                use.apply();
            }
            dialog.buffers[dialog.data.id] = data;
        } else
            dialog.buffers.push(data);
        break;
    }
    if (nextdialog)
        dialog.data = nextdialog;
    else
        dialog.style.display = 'none';
};

dialog.click = function() {
    let elt = event.target.parentNode;
    let index = Array.prototype.indexOf.call(elt.parentNode.children, elt) - 1;
    switch (event.target.dataset.type) {
    case 'close':
        dialog.style.display = 'none';
        break;
    case 'edit':
        let channels = [], buffer = dialog.buffers[index].buffer;
        for (let i = 0; i < buffer.numberOfChannels; i++)
            channels.push(buffer.getChannelData(i).join(','));
        let settings = [dialog.buffers[index].name, channels.join('\n'), buffer.sampleRate];
        dialog.make('Edit Audio Buffer', nodes.buffer_raw.settings.elements, settings);
        dialog.data = {
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
        dialog.buffers.push({ ...dialog.buffers[index], used: new Set() });
        elt.parentNode.insertBefore(elt.cloneNode(true), elt.parentNode.lastElementChild);
        break;
    case 'delete':
        switch (dialog.data.type) {
        case 'buffer':
            for (let use of dialog.buffers[index].used) {
                let data = eltdata.get(use);
                data.settings[0] = { buffer: null, type: 'none' };
                data.apply();
            }
            dialog.buffers.splice(index, 1);
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
        dialog.make('New Audio Buffer', desc.settings.elements, []);
        dialog.data = { type: 'buffer', data: { desc: desc, settings: [] } };
        break;
    }
};

dialog.help = function(info) {
    if (info.style) {
        let head = dialog.mdn.contentDocument.head;
        info.style.onload = () => {
            if (head.children[1] != info.style)
                head.removeChild(head.children[1]);
        }
        head.insertBefore(info.style, head.lastElementChild);
    }
    let article = dialog.mdn.contentDocument.body.firstElementChild;
    article.children[0].firstChild.replaceWith(info.name);
    article.children[1].replaceWith(info.text);
    article.children[2].firstElementChild.href = info.url;
    article.children[3].firstElementChild.textContent = info.name;
    article.children[3].firstElementChild.href = info.url;
    article.children[3].children[1].href = info.url + '/contributors.txt';
    dialog.mdn.style.display = 'block';
};

dialog.elt.addEventListener('submit', dialog.submit);
dialog.elt.addEventListener('click', dialog.click);

(function() {
    let close = document.createElement('img');
    close.src = document.baseURI.replace(/\/[^/]*(?:\?.*)?(?:#.*)?$/, '/icons.svg#close');
    close.id = 'close-img';
    close.addEventListener('click', () => dialog.mdn.style.display = 'none');
    dialog.mdn.onload = () =>
        dialog.mdn.contentDocument.body.firstElementChild.firstElementChild.appendChild(close);
})();

dialog.mdn.srcdoc = `<!DOCTYPE html>
<html>
    <head>
        <base href="https://developer.mozilla.org/" target="_blank" />
        <link rel="stylesheet" href="data:text/css,h1{font-size:2.25rem}body{font-family:Inter,sans-serif}"/>
        <style>
@font-face {
    font-family:Inter;
    src:url(https://api.allorigins.win/raw?url=https://developer.mozilla.org/static/media/Inter.var.c2fe3cb2b7c746f7966a.woff2) format("woff2 supports variations"),
        url(https://api.allorigins.win/raw?url=https://developer.mozilla.org/static/media/Inter.var.c2fe3cb2b7c746f7966a.woff2) format("woff2-variations");
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
    box-sizing: border-box
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
