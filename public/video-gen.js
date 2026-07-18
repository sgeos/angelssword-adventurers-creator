/**
 * ⚔️ AS Adventurer — Video Generation Module
 * Angel's Sword Studios
 * 
 * Tab 2: Generate animated videos from sprite images using Google's
 * Gemini Omni Flash API (gemini-omni-flash-preview via Interactions API).
 */

(function() {
    'use strict';

    const VideoGenCore = (typeof window !== 'undefined' && window.VideoGenCore)
        ? window.VideoGenCore
        : null;

    // ============================================
    // STATE
    // ============================================
    let generating = false;
    let cancelled = false;
    let referenceImages = []; // Array of { dataUrl, base64 }
    let generatedVideos = [];  // Array of { blob, url }
    let selectedVideos = new Set(); // Indices of selected videos
    let fromSpritePrep = false;

    // ============================================
    // REFERENCE IMAGE HANDLING
    // ============================================

    function loadReferenceFromHandoff() {
        const handoff = window.ASAdventurer.handoff;
        if (handoff.spriteBase64) {
            referenceImages = [{ dataUrl: handoff.spriteBase64 }];
            fromSpritePrep = true;

            // Show preview
            const preview = document.getElementById('vgRefImagePreview');
            const img = document.getElementById('vgRefImage');
            img.src = handoff.spriteBase64;
            preview.classList.remove('hidden');

            // Show "from sprite prep" indicator
            document.getElementById('vgRefFromSprite').classList.remove('hidden');
            document.getElementById('vgUploadZone').classList.add('hidden');
        }
    }

    function loadReferenceFiles(files) {
        referenceImages = [];
        fromSpritePrep = false;

        document.getElementById('vgRefFromSprite').classList.add('hidden');

        const maxFiles = Math.min(files.length, 3);
        let loaded = 0;

        for (let i = 0; i < maxFiles; i++) {
            const reader = new FileReader();
            reader.onload = (e) => {
                referenceImages.push({ dataUrl: e.target.result });
                loaded++;

                if (loaded === maxFiles) {
                    // Show first image preview
                    const preview = document.getElementById('vgRefImagePreview');
                    const img = document.getElementById('vgRefImage');
                    img.src = referenceImages[0].dataUrl;
                    preview.classList.remove('hidden');
                    showToast(`${referenceImages.length} reference image(s) loaded`, 'success');
                }
            };
            reader.readAsDataURL(files[i]);
        }
    }

    // ============================================
    // VIDEO GENERATION
    // ============================================

    async function generateVideo() {
        if (generating) return;

        const apiKey = localStorage.getItem('google_api_key');
        if (!apiKey) {
            showToast('No Google API key. Go to Settings to add one.', 'error');
            return;
        }

        if (referenceImages.length === 0) {
            showToast('Upload a reference image first, or send one from Sprite Prep', 'warning');
            return;
        }

        // Get mode early so we can validate keyframes
        const modeSelector = document.getElementById('vgModeSelector');
        const activeMode = modeSelector?.querySelector('.mode-btn.active');
        const mode = activeMode?.dataset.mode || 'reference';

        if (mode === 'keyframe' && referenceImages.length < 2) {
            showToast('Keyframe mode requires both a Start Frame and End Frame', 'warning');
            return;
        }

        // Get settings
        const duration = parseInt(document.getElementById('vgDuration')?.value || '5');
        const genCountEl = document.getElementById('vgGenCount');
        const activeBtn = genCountEl?.querySelector('.gen-count-btn.active');
        const genCount = activeBtn ? parseInt(activeBtn.dataset.count) : 1;

        // Read prompt from the correct field based on mode
        const prompt = mode === 'keyframe'
            ? (document.getElementById('vgKeyframePrompt')?.value?.trim() || '')
            : (document.getElementById('vgPrompt')?.value?.trim() || '');

        generating = true;
        cancelled = false;

        // Show progress
        document.getElementById('vgProgress').classList.add('active');
        document.getElementById('vgGenerateBtn').disabled = true;
        const status = document.getElementById('vgStatus');
        status.innerHTML = '<div class="status-msg info"><span class="spinner"></span> Generating video — this may take several minutes…</div>';

        try {
            const promises = [];
            for (let i = 0; i < genCount; i++) {
                if (cancelled) break;
                promises.push(generateOneVideo(apiKey, prompt, duration, mode));
            }

            const results = await Promise.allSettled(promises);
            generatedVideos = [];

            for (const result of results) {
                if (result.status === 'fulfilled' && result.value) {
                    generatedVideos.push(result.value);
                }
            }

            if (generatedVideos.length > 0) {
                displayVideoResults();
                window.notificationSound?.play();
                status.innerHTML = `<div class="status-msg success">✅ Generated ${generatedVideos.length} video(s)!</div>`;
            } else if (!cancelled) {
                // Collect actual error messages from failed attempts
                const errors = results
                    .filter(r => r.status === 'rejected')
                    .map(r => r.reason?.message || String(r.reason));
                const errorMsg = errors.length > 0 ? errors[0] : 'Unknown error — check the server console for details.';
                status.innerHTML = `<div class="status-msg error">❌ ${errorMsg}</div>`;
                console.error('[VideoGen] All attempts failed:', errors);
            }
        } catch (err) {
            status.innerHTML = `<div class="status-msg error">❌ ${err.message}</div>`;
        } finally {
            generating = false;
            document.getElementById('vgProgress').classList.remove('active');
            document.getElementById('vgGenerateBtn').disabled = false;
        }
    }

    async function generateOneVideo(apiKey, prompt, duration, mode) {
        // Build the Gemini Omni Flash Interactions API request via pure core.
        // Quirk: `duration` is collected by the UI but is NOT placed in the POST body.
        // Quirk: keyframe end image is loaded in UI but NOT sent (only first/start image).
        const requestBody = VideoGenCore.buildVideoRequestBody({
            prompt,
            mode,
            referenceImages
        });

        // Send through proxy
        const response = await fetch('/api/video/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            const msg = err?.error?.message || err?.message || `API error: ${response.status}`;
            throw new Error(msg);
        }

        const data = await response.json();
        console.log('[VideoGen] Response:', JSON.stringify(data).substring(0, 500));

        // Direct response — extract video from Interactions response
        return extractVideoFromResponse(data);
    }

    async function pollOperation(apiKey, operationName) {
        const maxAttempts = 120; // 10 minutes at 5s intervals
        const pollInterval = 5000;

        for (let i = 0; i < maxAttempts; i++) {
            if (cancelled) return null;

            await new Promise(r => setTimeout(r, pollInterval));

            const fillEl = document.getElementById('vgProgressFill');
            const textEl = document.getElementById('vgProgressText');
            if (fillEl) fillEl.style.width = `${Math.min(95, (i / maxAttempts) * 100)}%`;
            if (textEl) textEl.textContent = `Generating video... (${Math.floor(i * pollInterval / 1000)}s)`;

            try {
                const resp = await fetch('/api/video/poll', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': apiKey
                    },
                    body: JSON.stringify({ operationName })
                });

                const data = await resp.json();

                if (data.done || data.status === 'completed') {
                    return extractVideoFromResponse(data);
                }
            } catch (e) {
                console.warn('[VideoGen] Poll error:', e.message);
            }
        }

        throw new Error('Video generation timed out after 10 minutes');
    }

    function extractVideoFromResponse(data) {
        // Pure extract → { mimeType, base64 } | null; Blob/URL stay here.
        const payload = VideoGenCore.extractVideoPayload(data);
        if (!payload) {
            console.warn('[VideoGen] Could not extract video from response:', JSON.stringify(data).substring(0, 1000));
            throw new Error('No video data found in API response. Check the console for details.');
        }
        const blob = base64ToBlob(payload.base64, payload.mimeType);
        return { blob, url: URL.createObjectURL(blob) };
    }

    // ============================================
    // RESULTS DISPLAY
    // ============================================

    function displayVideoResults() {
        const grid = document.getElementById('vgResultsGrid');
        const section = document.getElementById('vgResultsSection');

        // Revoke any old blob URLs from previous video elements
        grid.querySelectorAll('video').forEach(v => {
            if (v.src && v.src.startsWith('blob:')) {
                v.pause();
                v.removeAttribute('src');
                v.load(); // Release the video resource
            }
        });

        grid.innerHTML = '';
        section.classList.remove('hidden');
        selectedVideos = new Set([0]); // Auto-select first

        generatedVideos.forEach((video, idx) => {
            const card = document.createElement('div');
            card.className = 'result-card' + (idx === 0 ? ' selected' : '');
            card.dataset.idx = idx;

            // Create video element properly (not via innerHTML) to ensure it loads
            const videoWrap = document.createElement('div');
            videoWrap.className = 'video-preview';
            const videoEl = document.createElement('video');
            videoEl.loop = true;
            videoEl.muted = true;
            videoEl.playsInline = true;
            videoEl.src = video.url;
            videoEl.load();
            videoWrap.appendChild(videoEl);

            const actions = document.createElement('div');
            actions.className = 'card-actions';
            actions.innerHTML = `
                <button class="btn btn-sm btn-secondary" data-action="play" data-idx="${idx}" title="Play/pause this video">▶️ Play</button>
                <button class="btn btn-sm btn-secondary" data-action="download" data-idx="${idx}" title="Download this video">💾 Save</button>
                <button class="btn btn-sm ${selectedVideos.has(idx) ? 'btn-primary' : 'btn-secondary'}" data-action="select" data-idx="${idx}" title="Select this video for the pipeline">
                    ${selectedVideos.has(idx) ? '✓ Selected' : '○ Select'}
                </button>
            `;

            card.appendChild(videoWrap);
            card.appendChild(actions);
            grid.appendChild(card);
        });
    }

    // Persistent event delegation for video results (only bound once)
    function bindVideoResultEvents() {
        const grid = document.getElementById('vgResultsGrid');
        if (!grid) return;

        grid.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const idx = parseInt(btn.dataset.idx);

            if (btn.dataset.action === 'play') {
                const video = grid.querySelectorAll('video')[idx];
                if (video) {
                    if (video.paused) { video.play(); btn.textContent = '⏸ Pause'; }
                    else { video.pause(); btn.textContent = '▶️ Play'; }
                }
            } else if (btn.dataset.action === 'download') {
                if (generatedVideos[idx]?.blob) {
                    const a = document.createElement('a');
                    a.href = generatedVideos[idx].url;
                    a.download = `${window.ASAdventurer.characterName || 'video'}_gen_${idx + 1}.mp4`;
                    a.click();
                }
            } else if (btn.dataset.action === 'select') {
                if (selectedVideos.has(idx)) {
                    selectedVideos.delete(idx);
                    btn.className = 'btn btn-sm btn-secondary';
                    btn.innerHTML = '○ Select';
                    btn.closest('.result-card').classList.remove('selected');
                } else {
                    selectedVideos.add(idx);
                    btn.className = 'btn btn-sm btn-primary';
                    btn.innerHTML = '✓ Selected';
                    btn.closest('.result-card').classList.add('selected');
                }
            }
        });
    }

    // ============================================
    // HANDOFF
    // ============================================

    function handoffToVideoPrep() {
        if (selectedVideos.size === 0) {
            showToast('Select at least one video first', 'warning');
            return;
        }

        // Quirk: multi-select UI, but handoff uses only the first selected index
        const video = VideoGenCore.pickHandoffVideo(generatedVideos, Array.from(selectedVideos));

        if (video) {
            window.ASAdventurer.handoff.videoBlob = video.blob;
            window.ASAdventurer.handoff.videoUrl = video.url;
            showToast('Video sent to Video Preparation', 'success');
            switchTab('tab-video-prep');
        }
    }

    // ============================================
    // INITIALIZATION
    // ============================================

    function initVideoGen() {
        // Mode selector (Reference / Keyframe)
        initModeSelector('vgModeSelector', (mode) => {
            document.getElementById('vgReferenceMode').classList.toggle('hidden', mode !== 'reference');
            document.getElementById('vgKeyframeMode').classList.toggle('hidden', mode !== 'keyframe');
        });

        // Upload zone
        initUploadZone('vgUploadZone', 'vgFileInput', (files) => {
            loadReferenceFiles(files);
        });

        // Keyframe uploads
        initUploadZone('vgStartFrameZone', 'vgStartFrameInput', (files) => {
            if (files[0]) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    // Ensure start frame is first in array
                    if (referenceImages.length === 0) referenceImages.push({});
                    referenceImages[0] = { dataUrl: e.target.result };

                    // Show preview
                    const preview = document.getElementById('vgStartFramePreview');
                    preview.src = e.target.result;
                    preview.classList.remove('hidden');
                    document.getElementById('vgStartFrameIcon').textContent = '✅';
                    document.getElementById('vgStartFrameText').textContent = 'Start Frame Loaded';
                    showToast('Start frame loaded', 'success');
                };
                reader.readAsDataURL(files[0]);
            }
        });

        initUploadZone('vgEndFrameZone', 'vgEndFrameInput', (files) => {
            if (files[0]) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    if (referenceImages.length < 2) referenceImages.push({});
                    referenceImages[1] = { dataUrl: e.target.result };

                    // Show preview
                    const preview = document.getElementById('vgEndFramePreview');
                    preview.src = e.target.result;
                    preview.classList.remove('hidden');
                    document.getElementById('vgEndFrameIcon').textContent = '✅';
                    document.getElementById('vgEndFrameText').textContent = 'End Frame Loaded';
                    showToast('End frame loaded', 'success');
                };
                reader.readAsDataURL(files[0]);
            }
        });

        // Duration slider
        initRange('vgDuration', 'vgDurationVal', 's');

        // Generation count
        initGenCount('vgGenCount');

        // Generate button
        document.getElementById('vgGenerateBtn')?.addEventListener('click', generateVideo);

        // Cancel button
        document.getElementById('vgCancelBtn')?.addEventListener('click', () => {
            cancelled = true;
            showToast('Generation cancelled', 'warning');
        });

        // Handoff button
        document.getElementById('vgHandoffBtn')?.addEventListener('click', handoffToVideoPrep);

        // Bind video result events once (persistent delegation)
        bindVideoResultEvents();

        // Check for handoff from Sprite Prep when tab becomes active
        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.target.classList.contains('active') && m.target.id === 'tab-video-gen') {
                    loadReferenceFromHandoff();
                }
            }
        });

        const panel = document.getElementById('tab-video-gen');
        if (panel) {
            observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
        }
    }

    // Init on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initVideoGen);
    } else {
        initVideoGen();
    }

})();
