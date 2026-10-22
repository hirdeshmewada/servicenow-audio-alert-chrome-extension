// First Acknowledgement - case page trigger
// Isolated from queue polling / audio alert code.

(function () {
    const PANEL_ID = 'sn-first-ack-extract-panel';

    function getOrigin() {
        return location.origin;
    }

    function getCaseSysIdFromPage() {
        try {
            const params = new URLSearchParams(location.search);
            const fromQuery = params.get('sys_id') || params.get('sysparm_sys_id');
            if (SNFirstAck.isSysId(fromQuery)) return fromQuery.trim();
        } catch (e) {}

        const href = location.href;
        const nextUi = href.match(/sn_customerservice_case\/([a-f0-9]{32})/i);
        if (nextUi) return nextUi[1];

        let decoded = href;
        try {
            decoded = decodeURIComponent(href);
        } catch (e) {}

        const encoded = decoded.match(/sn_customerservice_case\.do[^?\s]*\?[^'"\s]*sys_id=([a-f0-9]{32})/i);
        if (encoded) return encoded[1];

        const unique = document.getElementById('sys_uniqueValue');
        if (unique && SNFirstAck.isSysId(unique.value)) return unique.value.trim();

        const named = document.querySelector('input[name="sys_uniqueValue"]');
        if (named && SNFirstAck.isSysId(named.value)) return named.value.trim();

        return '';
    }

    function isCaseContext() {
        if (!/sn_customerservice_case/.test(location.href) &&
            !document.getElementById('sn_customerservice_case.form_header') &&
            !(document.getElementById('sys_target') && document.getElementById('sys_target').value === 'sn_customerservice_case')) {
            return false;
        }
        return !!getCaseSysIdFromPage();
    }

    function ensurePanel() {
        if (document.getElementById(PANEL_ID)) return document.getElementById(PANEL_ID);

        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.style.cssText = [
            'position:fixed',
            'right:16px',
            'bottom:16px',
            'z-index:2147483646',
            'width:420px',
            'max-height:70vh',
            'background:#111',
            'color:#eee',
            'font:12px/1.4 Consolas,monospace',
            'border:1px solid #444',
            'border-radius:8px',
            'box-shadow:0 8px 24px rgba(0,0,0,.35)',
            'display:flex',
            'flex-direction:column'
        ].join(';');

        panel.innerHTML =
            '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#1e1e1e;border-bottom:1px solid #333">' +
            '<strong>First Ack extraction</strong>' +
            '<button type="button" data-role="run" style="cursor:pointer;padding:4px 8px">Extract raw data</button>' +
            '</div>' +
            '<pre data-role="out" style="margin:0;padding:10px;overflow:auto;white-space:pre-wrap;word-break:break-word;flex:1">Open a case, then extract. Output is raw data only.</pre>';

        document.documentElement.appendChild(panel);
        panel.querySelector('[data-role="run"]').addEventListener('click', runExtraction);
        return panel;
    }

    async function runExtraction() {
        const out = document.querySelector('#' + PANEL_ID + ' [data-role="out"]');
        const caseSysId = getCaseSysIdFromPage();
        const origin = getOrigin();

        if (!caseSysId) {
            out.textContent = 'Could not read case sys_id from this page.';
            return;
        }

        out.textContent = 'Fetching Case, Asset, and Work Notes APIs for ' + caseSysId + ' ...';

        try {
            const extracted = await SNFirstAck.extractRawData(origin, caseSysId);
            const text = SNFirstAck.formatRawExtraction(extracted);
            console.log('[First Ack] raw extraction', extracted);
            console.log('[First Ack] formatted\n' + text);
            out.textContent = text;
        } catch (error) {
            console.error('[First Ack] extraction failed', error);
            out.textContent = 'Extraction failed: ' + (error && error.message ? error.message : String(error));
        }
    }

    function start() {
        if (!isCaseContext()) return;
        ensurePanel();
        const sysId = getCaseSysIdFromPage();
        if (sysId) {
            console.log('[First Ack] case sys_id:', sysId);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
