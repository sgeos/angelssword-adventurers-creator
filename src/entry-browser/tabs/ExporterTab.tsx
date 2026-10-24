/**
 * The model exporter: key out the background and export WebM or GIF.
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
import { Panel, PanelTitle, PanelTitleText, PanelTitleIcon, MainLayout, ConfigGrid, FormRow, StageSection, StageHeader, GoldDivider } from "../ui/primitives.tsx";

const ExporterTabView = (): ReactNode => (
    <>
                    {/* Export Mode Toggle */}
                    <div className="export-mode-toggle" id="exportModeToggle">
                        <button className="export-mode-btn active" data-mode="adventurer" title="WebM format — unlimited frames and resolution">⚔️ Adventurer</button>
                        <button className="export-mode-btn" data-mode="normal" title="GIF format — max 120 frames, 1000×1000">🟢 F. Normal</button>
                        <button className="export-mode-btn" data-mode="premium" title="GIF format — max 600 frames, 4000×4000">💎 F. Premium</button>
                    </div>

                    <MainLayout>
                        <div>
                            {/* Stage 1: Source */}
                            <StageSection className="stage" id="exStage1">
        <StageHeader number={1} title="Source Video" />
                                <Panel>
                                    <div className="upload-zone" id="exUploadZone" title="Drop a video file or click to browse">
                                        <div className="upload-icon">🎬</div>
                                        <div className="upload-text">Drop video here or click to browse</div>
                                        <div className="upload-hint">MP4, WebM, MOV — or received from Video Prep</div>
                                        <input type="file" id="exFileInput" accept="video/mp4,video/webm,video/quicktime,.mov" />
                                    </div>
                                    <div id="exFromVideoPrep" className="hidden mt-1">
                                        <div className="status-msg info">
                                            <span>📌</span> Video received from Video Preparation
                                        </div>
                                    </div>
                                </Panel>
                            </StageSection>

                            {/* Stage 2: Chroma Key */}
                            <StageSection className="stage disabled" id="exStage2">
        <StageHeader number={2} title="Chroma Key" />
                                <Panel>
                                    {/* Preview */}
                                    <div className="canvas-container" id="exCanvasContainer">
                                        <canvas id="exCanvas"></canvas>
                                        <div id="exCropOverlay" className="crop-overlay hidden">
                                            <div className="crop-region" id="exCropRegion"></div>
                                        </div>
                                    </div>

                                    {/* Frame Scrubber */}
                                    <div className="scrubber-container mt-1">
                                        <div className="scrubber-controls">
                                            <button className="btn btn-sm btn-icon" id="exPrevFrame" title="Previous frame (←)">⏮</button>
                                            <button className="btn btn-sm btn-icon" id="exPlayBtn" title="Play/Pause">▶️</button>
                                            <button className="btn btn-sm btn-icon" id="exNextFrame" title="Next frame (→)">⏭</button>
                                        </div>
                                        <input type="range" id="exScrubber" min="0" max="100" defaultValue="0" title="Scrub through video frames" />
                                        <span className="scrubber-info" id="exFrameInfo">0 / 0</span>
                                    </div>

                                    {/* Preview Modes */}
                                    <div className="flex items-center justify-between mt-1">
                                        <div className="preview-modes" id="exPreviewModes">
                                            <button className="preview-mode-btn active" data-mode="checker" title="Checkerboard transparency pattern">Checker</button>
                                            <button className="preview-mode-btn" data-mode="black" title="Black background">Black</button>
                                            <button className="preview-mode-btn" data-mode="white" title="White background">White</button>
                                            <button className="preview-mode-btn" data-mode="original" title="Show original without chroma key">Original</button>
                                        </div>
                                    </div>

                                    <GoldDivider />

                                    {/* Key Color */}
                                    <FormRow>
                                        <label>Key Color</label>
                                        <div className="flex items-center gap-sm">
                                            <div className="color-swatches" id="exColorSwatches">
                                                <div className="color-swatch selected" data-color="#00FF00" style={{ background: "#00FF00" }} title="Green">
                                                    <span className="swatch-badge">Green</span>
                                                </div>
                                                <div className="color-swatch" data-color="#FF00FF" style={{ background: "#FF00FF" }} title="Magenta">
                                                    <span className="swatch-badge">Magenta</span>
                                                </div>
                                                <div className="color-swatch" data-color="#0000FF" style={{ background: "#0000FF" }} title="Blue">
                                                    <span className="swatch-badge">Blue</span>
                                                </div>
                                                <div className="color-swatch" data-color="#FFFF00" style={{ background: "#FFFF00" }} title="Yellow">
                                                    <span className="swatch-badge">Yellow</span>
                                                </div>
                                                <div className="color-swatch" data-color="#00FFFF" style={{ background: "#00FFFF" }} title="Cyan">
                                                    <span className="swatch-badge">Cyan</span>
                                                </div>
                                            </div>
                                            <button className="eyedropper-btn" id="exEyedropper" title="Pick key color from the video frame">💧</button>
                                            <button className="btn btn-sm btn-secondary" id="exAutoDetect" title="Auto-detect the best key color from the video">Auto</button>
                                        </div>
                                    </FormRow>

                                    {/* Chroma Key Controls */}
                                    <FormRow>
                                        <label htmlFor="exSimilarity">Similarity</label>
                                        <div className="range-row">
                                            <input type="range" id="exSimilarity" min="0" max="100" defaultValue="40" title="How close a pixel's color must be to the key color to be removed (higher = more aggressive)" />
                                            <span className="range-value" id="exSimilarityVal">40%</span>
                                        </div>
                                    </FormRow>

                                    <FormRow>
                                        <label htmlFor="exSmoothness">Smoothness</label>
                                        <div className="range-row">
                                            <input type="range" id="exSmoothness" min="0" max="100" defaultValue="8" title="How gradually the key fades at edges (higher = softer edges)" />
                                            <span className="range-value" id="exSmoothnessVal">8%</span>
                                        </div>
                                    </FormRow>

                                    <FormRow>
                                        <label htmlFor="exSpillSuppress">Spill Suppression</label>
                                        <div className="range-row">
                                            <input type="range" id="exSpillSuppress" min="0" max="100" defaultValue="10" title="Remove color spill from the key color onto the character's edges" />
                                            <span className="range-value" id="exSpillSuppressVal">10%</span>
                                        </div>
                                    </FormRow>

                                    <FormRow>
                                        <label htmlFor="exSmokeCleanup">Smoke Cleanup</label>
                                        <div className="range-row" style={{ justifyContent: "flex-start", gap: "0.5rem" }}>
                                            <input type="checkbox" id="exSmokeCleanup" title="Convert remaining key-colored elements (pink smoke, etc.) into semi-transparent dark gray" />
                                            <span className="range-value">Neutralize key-colored VFX</span>
                                        </div>
                                    </FormRow>

                                    <GoldDivider />

                                    {/* Visual Adjustments */}
                                    <ConfigGrid>
                                        <FormRow>
                                            <label htmlFor="exScale">Scale</label>
                                            <div className="range-row">
                                                <input type="range" id="exScale" min="10" max="300" defaultValue="100" title="Scale the output size" />
                                                <span className="range-value" id="exScaleVal">100%</span>
                                            </div>
                                        </FormRow>
                                        <FormRow>
                                            <label htmlFor="exVOffset">Vertical Offset</label>
                                            <div className="range-row">
                                                <input type="range" id="exVOffset" min="-500" max="500" defaultValue="0" title="Shift the video vertically" />
                                                <span className="range-value" id="exVOffsetVal">0px</span>
                                            </div>
                                        </FormRow>
                                        <FormRow>
                                            <label htmlFor="exSaturation">Saturation</label>
                                            <div className="range-row">
                                                <input type="range" id="exSaturation" min="0" max="200" defaultValue="100" title="Adjust color saturation (100% = original)" />
                                                <span className="range-value" id="exSaturationVal">100%</span>
                                            </div>
                                        </FormRow>
                                        <FormRow>
                                            <label>Ref. Image</label>
                                            <div className="range-row" style={{ gap: "0.4rem", alignItems: "center" }}>
                                                <input type="file" id="exRefImage" accept="image/*" style={{ display: "none" }} />
                                                <button type="button" id="exRefImageBtn" className="btn btn-sm" style={{ padding: "2px 8px", fontSize: "0.75rem" }} title="Upload a clean reference image to auto-match saturation">Upload</button>
                                                <button type="button" id="exRefMatchBtn" className="btn btn-sm" style={{ padding: "2px 8px", fontSize: "0.75rem", display: "none" }} title="Auto-match saturation to reference">Auto Match</button>
                                                <img id="exRefThumb" style={{ display: "none", height: "28px", border: "1px solid #666", borderRadius: "3px" }} />
                                                <button type="button" id="exRefClearBtn" className="btn btn-sm" style={{ padding: "2px 6px", fontSize: "0.7rem", display: "none" }} title="Remove reference image">✕</button>
                                            </div>
                                        </FormRow>
                                        <FormRow>
                                            <label htmlFor="exBrightness">Brightness</label>
                                            <div className="range-row">
                                                <input type="range" id="exBrightness" min="50" max="150" defaultValue="100" title="Adjust brightness (100% = original)" />
                                                <span className="range-value" id="exBrightnessVal">100%</span>
                                            </div>
                                        </FormRow>
                                        <FormRow>
                                            <label htmlFor="exEdgeFade">Edge Fade</label>
                                            <div className="range-row">
                                                <input type="range" id="exEdgeFade" min="0" max="200" defaultValue="0" title="Fade out left, right, and top edges to prevent hard rectangular cutoff (0 = off)" />
                                                <span className="range-value" id="exEdgeFadeVal">0px</span>
                                            </div>
                                        </FormRow>
                                        <FormRow>
                                            <label htmlFor="exAntiAlias">Anti-Aliasing</label>
                                            <label className="toggle-switch" title="Smooth jagged edges on the chroma key cutout">
                                                <input type="checkbox" id="exAntiAlias" />
                                                <span className="slider"></span>
                                            </label>
                                        </FormRow>
                                    </ConfigGrid>

                                    {/* Crop */}
                                    <FormRow marginTop={8}>
                                        <label>Crop Ratio</label>
                                        <div className="seg-toggle" id="exCropRatio">
                                            <button className="seg-btn active" data-ratio="off" title="No crop">Off</button>
                                            <button className="seg-btn" data-ratio="1:1" title="Square crop">1:1</button>
                                            <button className="seg-btn" data-ratio="4:3" title="4:3 crop">4:3</button>
                                        </div>
                                    </FormRow>
                                </Panel>
                            </StageSection>

                            {/* Stage 3: Export */}
                            <StageSection className="stage disabled" id="exStage3">
        <StageHeader number={3} title="Export" />
                                <Panel>
                                    {/* Export Settings */}
                                    <ConfigGrid>
                                        <FormRow>
                                            <label htmlFor="exStartFrame">Start Frame</label>
                                            <input type="number" id="exStartFrame" defaultValue="0" min="0" title="First frame to include in the export" />
                                        </FormRow>
                                        <FormRow>
                                            <label htmlFor="exEndFrame">End Frame</label>
                                            <input type="number" id="exEndFrame" defaultValue="0" min="0" title="Last frame to include in the export" />
                                        </FormRow>
                                        <FormRow>
                                            <label htmlFor="exFrameSkip">Frame Skip</label>
                                            <input type="number" id="exFrameSkip" defaultValue="0" min="0" max="10" title="Skip N frames between each exported frame (0 = no skip)" />
                                        </FormRow>
                                        <FormRow>
                                            <label htmlFor="exFPS">FPS Override</label>
                                            <input type="number" id="exFPS" defaultValue="0" min="0" max="60" title="Override the output FPS (0 = match source)" />
                                        </FormRow>
                                    </ConfigGrid>

                                    <ConfigGrid marginTop={8}>
                                        <FormRow>
                                            <label htmlFor="exWidth">Output Width</label>
                                            <input type="number" id="exWidth" defaultValue="0" min="0" title="Output width in pixels (0 = auto)" />
                                        </FormRow>
                                        <FormRow>
                                            <label htmlFor="exHeight">Output Height</label>
                                            <div className="flex items-center gap-sm">
                                                <input type="number" id="exHeight" defaultValue="0" min="0" style={{ flex: "1" }} title="Output height in pixels (0 = auto)" />
                                                <label className="toggle-switch" title="Lock aspect ratio">
                                                    <input type="checkbox" id="exAspectLock" defaultChecked />
                                                    <span className="slider"></span>
                                                </label>
                                                <span className="text-dim" style={{ fontSize: "0.7rem" }}>🔒</span>
                                            </div>
                                        </FormRow>
                                    </ConfigGrid>

                                    <GoldDivider />

                                    {/* Quick Filename Buttons */}
                                    <FormRow>
                                        <label>Quick Filename</label>
                                        <div className="filename-presets" id="exFilenamePresets">
                                            <button className="filename-preset-btn" data-preset="Neutral_Idle" title="Set filename to {name}_Neutral_Idle">Neutral Idle</button>
                                            <button className="filename-preset-btn" data-preset="Intro" title="Set filename to {name}_Intro">Intro</button>
                                            <button className="filename-preset-btn" data-preset="Outro" title="Set filename to {name}_Outro">Outro</button>
                                            <button className="filename-preset-btn" data-preset="Neutral_Speaking" title="Set filename to {name}_Neutral_Speaking">Neutral Speaking</button>
                                            <button className="filename-preset-btn" data-preset="Animation" title="Set filename to {name}_Animation">Animation</button>
                                            <button className="filename-preset-btn" data-preset="custom" title="Enter a custom filename">Custom</button>
                                        </div>
                                        <input type="text" id="exFilename" placeholder="output" title="Output filename (without extension)" className="mt-1" />
                                    </FormRow>

                                    {/* Estimate */}
                                    <div className="export-estimate" id="exEstimate">
                                        <span id="exEstFrames">Frames: --</span>
                                        <span id="exEstSize">Est. Size: --</span>
                                        <span id="exEstFormat">Format: WebM</span>
                                    </div>

                                    {/* Export Button */}
                                    <button className="btn-handoff" id="exExportBtn" title="Export the final transparent animation">
                                        📦 Export Transparent Motion
                                    </button>

                                    <div className="progress-container" id="exProgress">
                                        <div className="progress-bar"><div className="fill" id="exProgressFill"></div></div>
                                        <div className="progress-text">
                                            <span id="exProgressText">Exporting...</span>
                                            <button className="btn btn-sm btn-danger" id="exCancelBtn">Cancel</button>
                                        </div>
                                    </div>

                                    <div id="exStatus"></div>
                                </Panel>
                            </StageSection>
                        </div>

                        {/* Preview Sidebar */}
                        <div>
                            <Panel>
                                <PanelTitle><PanelTitleIcon>📊</PanelTitleIcon><PanelTitleText>Export Info</PanelTitleText></PanelTitle>
                                <div id="exInfo" className="text-muted" style={{ fontSize: "0.8rem" }}>
                                    <div>No video loaded</div>
                                </div>
                            </Panel>

                            <Panel>
                                <PanelTitle><PanelTitleIcon>📋</PanelTitleIcon><PanelTitleText>Mode Limits</PanelTitleText></PanelTitle>
                                <div id="exModeLimits" className="text-muted" style={{ fontSize: "0.8rem" }}>
                                    <div><strong className="text-gold">Adventurer</strong></div>
                                    <div>Format: WebM</div>
                                    <div>Max Frames: Unlimited</div>
                                    <div>Max Resolution: Unlimited</div>
                                </div>
                            </Panel>
                        </div>
                    </MainLayout>
    </>
);

export const ExporterTab = memo(ExporterTabView);
