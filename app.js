/* ── Video Pipeline Form — app.js ───────────────────────────── */
(() => {
    'use strict';

    /* ── Defaults from schema ─────────────────────────────────── */
    const DEFAULTS = {
        voiceId: 'DEFAULT',
        styleLock: 'clean educational motion graphics, consistent palette, no on-screen text in generated video clips',
        targetMinutesMin: 10,
        targetMinutesMax: 20,
        minSlides: 10,
        maxSlides: 18,
        wpmTarget: 140,
        maxClips: 6,
        clipDurationMin: 3,
        clipDurationMax: 10,
        inworldMaxChars: 2000,
    };

    const WEBHOOK_URLS = {
        test: 'https://n8n.aloha.university/webhook-test/video-pipeline',
        prod: 'https://n8n.aloha.university/webhook/video-pipeline',
    };

    /* ── DOM refs ─────────────────────────────────────────────── */
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);

    const form = $('#pipeline-form');
    const webhookUrl = $('#webhook-url');
    const envToggle = $('#env-toggle');
    const lblTest = $('#lbl-test');
    const lblProd = $('#lbl-prod');
    const submitBtn = $('#submit-btn');
    const copyBtn = $('#copy-btn');
    const preview = $('#json-preview');
    const constraintsToggle = $('#constraints-toggle');
    const constraintsBody = $('#constraints-body');

    let isProd = false;

    /* ── Environment toggle ───────────────────────────────────── */
    function setEnv(prod) {
        isProd = prod;
        envToggle.classList.toggle('prod', prod);
        envToggle.setAttribute('aria-checked', prod);
        lblTest.classList.toggle('active', !prod);
        lblProd.classList.toggle('active', prod);
        webhookUrl.value = prod ? WEBHOOK_URLS.prod : WEBHOOK_URLS.test;
    }

    envToggle.addEventListener('click', () => setEnv(!isProd));
    envToggle.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setEnv(!isProd); }
    });

    /* ── Source tabs ───────────────────────────────────────────── */
    $$('.source-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            $$('.source-tab').forEach((t) => t.classList.remove('active'));
            tab.classList.add('active');
            const which = tab.dataset.source;
            $('#pane-html').classList.toggle('active', which === 'html');
            $('#pane-text').classList.toggle('active', which === 'text');
            updatePreview();
        });
    });

    /* ── Constraints toggle ───────────────────────────────────── */
    constraintsToggle.addEventListener('click', () => {
        constraintsToggle.classList.toggle('open');
        constraintsBody.classList.toggle('open');
    });

    /* ── Range sliders ────────────────────────────────────────── */
    const constraintKeys = [
        'targetMinutesMin', 'targetMinutesMax', 'minSlides', 'maxSlides',
        'wpmTarget', 'maxClips', 'clipDurationMin', 'clipDurationMax', 'inworldMaxChars',
    ];

    constraintKeys.forEach((key) => {
        const slider = $(`#c-${key}`);
        const display = $(`#v-${key}`);
        if (!slider || !display) return;
        slider.addEventListener('input', () => {
            display.textContent = slider.value;
            updatePreview();
        });
    });

    /* ── Word count helper ────────────────────────────────────── */
    function wordCount(text) {
        const stripped = text.replace(/<[^>]*>/g, ' ');
        const words = stripped.trim().split(/\s+/).filter(Boolean);
        return words.length;
    }

    function updateWordCount(textareaId, wcId) {
        const ta = $(`#${textareaId}`);
        const wc = $(`#${wcId}`);
        if (!ta || !wc) return;
        const count = wordCount(ta.value);
        if (!ta.value.trim()) { wc.textContent = ''; wc.className = 'word-count'; return; }
        wc.textContent = `${count.toLocaleString()} word${count !== 1 ? 's' : ''}`;
        wc.className = 'word-count';
        if (count >= 800 && count <= 3000) wc.classList.add('ok');
        else if (count > 0) wc.classList.add('warn');
    }

    $('#sourceHtml').addEventListener('input', () => { updateWordCount('sourceHtml', 'wc-html'); updatePreview(); });
    $('#sourceText').addEventListener('input', () => { updateWordCount('sourceText', 'wc-text'); updatePreview(); });

    /* ── Build payload ────────────────────────────────────────── */
    function buildPayload() {
        const payload = {};

        // jobId
        const jobId = $('#jobId').value.trim();
        if (jobId) payload.jobId = jobId;

        // course (always present)
        const course = {};
        course.courseName = $('#courseName').value.trim();
        course.sectionTitle = $('#sectionTitle').value.trim();

        const voiceId = $('#voiceId').value.trim();
        if (voiceId && voiceId !== DEFAULTS.voiceId) course.voiceId = voiceId;

        const styleLock = $('#styleLock').value.trim();
        if (styleLock && styleLock !== DEFAULTS.styleLock) course.styleLock = styleLock;

        payload.course = course;

        // source
        const activeSource = $('.source-tab.active')?.dataset.source;
        if (activeSource === 'html') {
            const html = $('#sourceHtml').value.trim();
            if (html) payload.sourceHtml = html;
        } else {
            const text = $('#sourceText').value.trim();
            if (text) payload.sourceText = text;
        }

        // constraints — only include values that differ from defaults
        const constraints = {};
        let hasConstraints = false;
        constraintKeys.forEach((key) => {
            const slider = $(`#c-${key}`);
            if (!slider) return;
            const val = parseInt(slider.value, 10);
            if (val !== DEFAULTS[key]) {
                constraints[key] = val;
                hasConstraints = true;
            }
        });
        if (hasConstraints) payload.constraints = constraints;

        return payload;
    }

    /* ── HTML escaping ────────────────────────────────────────── */
    function escapeHTML(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /* ── JSON syntax highlighter ──────────────────────────────── */
    function highlightJSON(escaped) {
        return escaped
            .replace(
                /(&quot;(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\&])*?&quot;)\s*:/g,
                '<span class="json-key">$1</span>:'
            )
            .replace(
                /:\s*(&quot;(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\&])*?&quot;)/g,
                (m, val) => `: <span class="json-string">${val}</span>`
            )
            .replace(
                /:\s*(\d+)/g,
                ': <span class="json-number">$1</span>'
            )
            .replace(
                /:\s*(null)/g,
                ': <span class="json-null">null</span>'
            );
    }

    /* ── Update preview (debounced) ───────────────────────────── */
    let previewTimer = null;
    function updatePreview() {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(() => {
            const payload = buildPayload();
            const raw = JSON.stringify(payload, null, 2);
            // Escape first so HTML in user strings is safe, then highlight
            const escaped = escapeHTML(raw);
            preview.innerHTML = highlightJSON(escaped);
        }, 80);
    }

    // Live preview on any form input
    form.addEventListener('input', updatePreview);

    /* ── Copy button ──────────────────────────────────────────── */
    copyBtn.addEventListener('click', async () => {
        const payload = buildPayload();
        const text = JSON.stringify(payload, null, 2);
        try {
            await navigator.clipboard.writeText(text);
            copyBtn.textContent = '✓ Copied';
            copyBtn.classList.add('copied');
            setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('copied'); }, 1800);
        } catch {
            toast('Clipboard access denied', 'error');
        }
    });

    /* ── Validation ───────────────────────────────────────────── */
    function validate() {
        let valid = true;
        $$('.form-group.invalid').forEach((g) => g.classList.remove('invalid'));

        if (!$('#courseName').value.trim()) {
            $('#courseName').closest('.form-group').classList.add('invalid');
            valid = false;
        }
        if (!$('#sectionTitle').value.trim()) {
            $('#sectionTitle').closest('.form-group').classList.add('invalid');
            valid = false;
        }

        const jobId = $('#jobId').value.trim();
        if (jobId && !/^[a-zA-Z0-9_\-\.]+$/.test(jobId)) {
            $('#jobId').closest('.form-group').classList.add('invalid');
            valid = false;
        }

        const activeSource = $('.source-tab.active')?.dataset.source;
        if (activeSource === 'text') {
            const text = $('#sourceText').value.trim();
            if (text && text.length < 100) {
                $('#sourceText').closest('.form-group').classList.add('invalid');
                valid = false;
            }
        }

        return valid;
    }

    /* ── Submit ───────────────────────────────────────────────── */
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validate()) {
            toast('Please fix the highlighted fields', 'error');
            return;
        }

        const url = webhookUrl.value.trim();
        if (!url) { toast('Webhook URL is empty', 'error'); return; }

        const payload = buildPayload();
        submitBtn.disabled = true;
        submitBtn.classList.add('loading');

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                toast(`✅ Sent! Status ${res.status}`, 'success');
            } else {
                const body = await res.text().catch(() => '');
                toast(`⚠️ ${res.status} — ${body || res.statusText}`, 'error');
            }
        } catch (err) {
            toast(`❌ Network error: ${err.message}`, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.classList.remove('loading');
        }
    });

    /* ── Toast system ─────────────────────────────────────────── */
    function toast(message, type = 'info') {
        const container = $('#toast-container');
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = message;
        container.appendChild(el);
        setTimeout(() => el.classList.add('out'), 3500);
        setTimeout(() => el.remove(), 3900);
    }

    /* ── Init ──────────────────────────────────────────────────── */
    updatePreview();
})();
