/**
 * Video generation: animate the sprite through a provider.
 *
 * The markup only. Behaviour belongs to the stage's controller in
 * `platform-browser/stages/`, which finds these elements by identifier once
 * the application has rendered them. That is why the identifiers, classes and
 * `data-` attributes are kept exactly, and why this component is memoized and
 * takes no props: it renders once, and the controller owns its subtree after.
 * See the invariant stated in `app/App.tsx`.
 *
 * Layout and type come from the Tamagui primitives. The controls inside, the
 * canvases, inputs and buttons the controller drives, stay elements styled by
 * the stylesheet, which is also what styles the markup the controller
 * generates at run time. On a native target this whole component is the part
 * that would run as a DOM component.
 */
import { memo, type ReactNode } from "react";
import { Panel, PanelTitle, PanelTitleText, PanelTitleIcon, PanelSubtitle, MainLayout, TwoCol, ConfigGrid, FormRow, GoldDivider, InfoBanner, InfoBannerIcon, InfoBannerText, InfoNote, InfoNoteIcon } from "../primitives.tsx";

/**
 * The prompt both modes start from. Written with explicit line breaks rather
 * than as a multi-line literal, whose continuation lines would carry whatever
 * indentation surrounds them into the text area.
 */
const DEFAULT_PROMPT =
    "Locked-off Position Static Camera. Perfect Seamless Loop. 2d Anime Sakuga Game Animation Style. (Character description), (Animation Type) Subtle Movements.\n\n[Constraints]: Do NOT Camera Zoom, Absolute static camera. Zero Camera movement, no panning, no drifting, and no zooming. The camera is perfectly stationary; only the character moves. The character herself doesnt move either on the Y axis. Maintain the same character position.";

const VideoGenTabView = (): ReactNode => (
    <>
                    <InfoBanner>
                        <InfoBannerIcon>💡</InfoBannerIcon>
                        <InfoBannerText>Skip this step if you want to use your own video generator (e.g., Veo, RunwayML, Kling, etc.). Upload your video directly in Video Prep instead.</InfoBannerText>
                    </InfoBanner>

                    <MainLayout>
                        <div>
                            {/* Reference Image */}
                            <Panel>
                                <PanelTitle><PanelTitleIcon>🖼️</PanelTitleIcon><PanelTitleText>Reference Image</PanelTitleText></PanelTitle>
                                <PanelSubtitle>Use the sprite from Step 1, or upload your own reference image(s). <span id="vgReferenceUse" title="What the selected provider does with the images you add">Uses the first image only</span>.</PanelSubtitle>

                                <div id="vgRefImagePreview" className="mb-2 hidden">
                                    <div className="canvas-container">
                                        <img id="vgRefPrimary" style={{ width: "100%", display: "block" }} title="The first image. In reference mode it is the only one any provider is sent." />
                                    </div>
                                    <div id="vgRefSlots" style={{ display: "flex", gap: "0.25rem", marginTop: "0.25rem" }}></div>
                                    <button className="btn btn-sm btn-secondary mt-1 hidden" id="vgRefClearBtn" title="Remove every reference image">✖ Clear References</button>
                                </div>
                                <input type="file" id="vgRefSlotInput" accept="image/*" style={{ display: "none" }} />

                                <div className="upload-zone" id="vgUploadZone" title="Upload reference image(s) for video generation">
                                    <div className="upload-icon">🖼️</div>
                                    <div className="upload-text">Drop reference image(s) or click to browse</div>
                                    <div className="upload-hint">PNG, JPG — up to 3 images for Reference Mode</div>
                                    <input type="file" id="vgFileInput" accept="image/*" multiple />
                                </div>

                                <div id="vgRefFromSprite" className="hidden mt-1">
                                    <div className="status-msg info">
                                        <span>📌</span> Using sprite from Sprite Prep
                                    </div>
                                </div>
                            </Panel>

                            {/* Generation Mode */}
                            <Panel>
                                <PanelTitle><PanelTitleIcon>🎬</PanelTitleIcon><PanelTitleText>Video Generation</PanelTitleText></PanelTitle>

                                <FormRow>
                                    <label>Provider</label>
                                    <div className="seg-toggle" id="vgProvider">
                                        <button className="seg-btn active" data-mode="google" title="Generate with Google Gemini. Uses your Google API key.">Gemini</button>
                                        <button className="seg-btn" data-mode="xai" title="Generate with Grok. Uses your xAI API key from Settings.">Grok</button>
                                        <button className="seg-btn" data-mode="comfyui" title="Generate locally with ComfyUI Wan. Configure it in Settings.">ComfyUI</button>
                                    </div>
                                </FormRow>

                                <div className="mode-selector" id="vgModeSelector">
                                    <button className="mode-btn active" data-mode="reference" title="Provide reference images and describe the animation">🖼️ Reference Mode</button>
                                    <button className="mode-btn" data-mode="keyframe" title="Upload start and end frames — AI interpolates between them">🔑 Keyframe Mode</button>
                                </div>

                                {/* Reference Mode Fields */}
                                <div id="vgReferenceMode">
                                    <FormRow>
                                        <label htmlFor="vgPrompt">Animation Prompt</label>
                                        <textarea id="vgPrompt" rows={6} title="Describe the animation you want the AI to generate" defaultValue={DEFAULT_PROMPT} />
                                        <div className="text-dim mt-1" style={{ fontSize: "0.7rem" }}>
                                            Edit the (parenthesized) sections. Remove "Perfect Seamless Loop" if not a loop.
                                        </div>
                                    </FormRow>
                                </div>

                                {/* Keyframe Mode Fields */}
                                <div id="vgKeyframeMode" className="hidden">
                                    <div className="text-muted mb-1" id="vgKeyframeUse" style={{ fontSize: "0.8rem" }} title="What the selected provider does with the two frames">Gemini is sent both frames, the start and then the end.</div>
                                    <TwoCol>
                                        <FormRow>
                                            <label>Start Frame</label>
                                            <div className="upload-zone" id="vgStartFrameZone" style={{ padding: "1rem" }} title="Upload the starting frame">
                                                <div className="upload-icon" style={{ fontSize: "1.5rem" }} id="vgStartFrameIcon">🏁</div>
                                                <div className="upload-text" style={{ fontSize: "0.75rem" }} id="vgStartFrameText">Start Frame</div>
                                                <input type="file" id="vgStartFrameInput" accept="image/*" />
                                                <img id="vgStartFramePreview" className="hidden" style={{ maxWidth: "100%", maxHeight: "180px", borderRadius: "var(--radius)", border: "1px solid var(--border)", marginTop: "0.5rem" }} />
                                            </div>
                                        </FormRow>
                                        <FormRow>
                                            <label>End Frame</label>
                                            <div className="upload-zone" id="vgEndFrameZone" style={{ padding: "1rem" }} title="Upload the ending frame">
                                                <div className="upload-icon" style={{ fontSize: "1.5rem" }} id="vgEndFrameIcon">🎯</div>
                                                <div className="upload-text" style={{ fontSize: "0.75rem" }} id="vgEndFrameText">End Frame</div>
                                                <input type="file" id="vgEndFrameInput" accept="image/*" />
                                                <img id="vgEndFramePreview" className="hidden" style={{ maxWidth: "100%", maxHeight: "180px", borderRadius: "var(--radius)", border: "1px solid var(--border)", marginTop: "0.5rem" }} />
                                            </div>
                                        </FormRow>
                                    </TwoCol>
                                    <FormRow marginTop={8}>
                                        <label htmlFor="vgKeyframePrompt">Animation Prompt</label>
                                        <textarea id="vgKeyframePrompt" rows={6} title="Describe the animation for the keyframe interpolation" defaultValue={DEFAULT_PROMPT} />
                                        <div className="text-dim mt-1" style={{ fontSize: "0.7rem" }}>
                                            Edit the (parenthesized) sections. Remove "Perfect Seamless Loop" if not a loop.
                                        </div>
                                    </FormRow>
                                </div>

                                <GoldDivider />

                                <ConfigGrid>
                                    <FormRow>
                                        <label htmlFor="vgDuration">Video Length</label>
                                        <div className="range-row">
                                            <input type="range" id="vgDuration" min="3" max="10" defaultValue="5" title="Duration of the generated video in seconds" />
                                            <span className="range-value" id="vgDurationVal">5s</span>
                                        </div>
                                    </FormRow>
                                    <FormRow>
                                        <label>Simultaneous Generations</label>
                                        <div className="gen-count" id="vgGenCount">
                                            <button className="gen-count-btn active" data-count="1" title="Generate 1 video">1</button>
                                            <button className="gen-count-btn" data-count="2" title="Generate 2 videos">2</button>
                                            <button className="gen-count-btn" data-count="3" title="Generate 3 videos">3</button>
                                            <button className="gen-count-btn" data-count="4" title="Generate 4 videos">4</button>
                                        </div>
                                    </FormRow>
                                </ConfigGrid>

                                <FormRow marginTop={16}>
                                    <div className="flex items-center justify-between">
                                        <span className="text-dim" style={{ fontSize: "0.7rem" }} id="vgOutputNote" title="What the selected provider actually produces">Landscape, whatever your reference · ~$0.10/sec (estimate)</span>
                                    </div>
                                </FormRow>

                                <button className="btn-handoff mt-2" id="vgGenerateBtn" title="Generate video(s) using Gemini Omni Flash">
                                    🎬 Generate Video
                                </button>

                                <div className="progress-container" id="vgProgress">
                                    <div className="progress-bar"><div className="fill" id="vgProgressFill"></div></div>
                                    <div className="progress-text">
                                        <span id="vgProgressText">Generating video...</span>
                                        <button className="btn btn-sm btn-danger" id="vgCancelBtn">Cancel</button>
                                    </div>
                                </div>

                                <div id="vgStatus"></div>
                            </Panel>

                            {/* Results */}
                            <div id="vgResultsSection" className="hidden">
                                <Panel>
                                    <PanelTitle><PanelTitleIcon>🎞️</PanelTitleIcon><PanelTitleText>Generated Videos</PanelTitleText></PanelTitle>
                                    <div className="results-grid" id="vgResultsGrid"></div>
                                    <div className="mt-2">
                                        <button className="btn-handoff" id="vgHandoffBtn" title="Send selected video(s) to Video Preparation">
                                            Add to Video Preparation →
                                        </button>
                                    </div>
                                </Panel>
                            </div>
                        </div>

                        {/* Sidebar */}
                        <div>
                            <Panel>
                                <PanelTitle><PanelTitleIcon>ℹ️</PanelTitleIcon><PanelTitleText>About Gemini Omni Flash</PanelTitleText></PanelTitle>
                                <PanelSubtitle>
                                    Google's Gemini Omni Flash generates short animated videos from reference images and text prompts.
                                    Perfect for creating idle animations, talking motions, and simple character movements.
                                </PanelSubtitle>
                                <InfoNote>
                                    <InfoNoteIcon>🔑</InfoNoteIcon>
                                    Requires a Google Gemini API key. Set it up in the <strong>Settings</strong> tab.
                                </InfoNote>
                            </Panel>
                        </div>
                    </MainLayout>
    </>
);

export const VideoGenTab = memo(VideoGenTabView);
