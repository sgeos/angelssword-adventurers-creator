/**
 * Sprite preparation: upload a sprite, or generate one, and place it on a 1280 by 720 chroma key canvas.
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
import { Dim, Panel, PanelTitle, PanelTitleText, PanelTitleIcon, MainLayout, TwoCol, FormRow, StageSection, StageHeader } from "../primitives.tsx";

const SpritePrepTabView = (): ReactNode => (
    <>
                    {/* Mode Selector */}
                    <div className="mode-selector" id="spritePrepMode">
                        <button className="mode-btn active" data-mode="manual" title="Upload your own sprite image">📁 Manual Upload</button>
                        <button className="mode-btn" data-mode="generate" title="Generate a sprite using AI (requires OpenAI API key)">✨ AI Generate</button>
                    </div>

                    {/* ── Manual Mode ── */}
                    <div id="spriteManualMode">
                        <MainLayout>
                            <div>
                                {/* Stage 1: Upload */}
                                <StageSection className="stage" id="spManualStage1">
        <StageHeader number={1} title="Upload Sprite" />
                                    <Panel>
                                        <FormRow>
                                            <label htmlFor="spCharName">Character Name</label>
                                            <input type="text" id="spCharName" placeholder="e.g. Mirrime, Nix, Aniela..." title="Your character's name — used for filenames and AI prompts" />
                                        </FormRow>
                                        <div className="upload-zone" id="spUploadZone" title="Drop a PNG here or click to browse">
                                            <div className="upload-icon">🖼️</div>
                                            <div className="upload-text">Drop sprite PNG here or click to browse</div>
                                            <div className="upload-hint">Any resolution — will be placed on 1280×720 canvas</div>
                                            <input type="file" id="spFileInput" accept="image/png,image/jpeg,image/webp" />
                                        </div>
                                    </Panel>
                                </StageSection>

                                {/* Stage 2: Key Color & Controls */}
                                <StageSection className="stage disabled" id="spManualStage2">
        <StageHeader number={2} title="Key Color & Position" />
                                    <Panel>
                                        <FormRow>
                                            <label>Key Color <span className="text-dim">(background color for chroma key)</span></label>
                                            <div className="color-swatches" id="spColorSwatches">
                                                <div className="color-swatch selected" data-color="#00FF00" style={{ background: "#00FF00" }} title="Green — most common chroma key color">
                                                    <span className="swatch-badge">Green</span>
                                                </div>
                                                <div className="color-swatch" data-color="#FF00FF" style={{ background: "#FF00FF" }} title="Magenta — great for characters with green elements">
                                                    <span className="swatch-badge">Magenta</span>
                                                </div>
                                                <div className="color-swatch" data-color="#0000FF" style={{ background: "#0000FF" }} title="Blue — avoid for blue-haired characters">
                                                    <span className="swatch-badge">Blue</span>
                                                </div>
                                                <div className="color-swatch" data-color="#FFFF00" style={{ background: "#FFFF00" }} title="Yellow — avoid for blond characters">
                                                    <span className="swatch-badge">Yellow</span>
                                                </div>
                                                <div className="color-swatch" data-color="#00FFFF" style={{ background: "#00FFFF" }} title="Cyan — alternative to blue/green">
                                                    <span className="swatch-badge">Cyan</span>
                                                </div>
                                            </div>
                                        </FormRow>

                                        <FormRow>
                                            <label htmlFor="spOffset">Vertical Offset</label>
                                            <div className="range-row">
                                                <input type="range" id="spOffset" min="-500" max="500" defaultValue="0" title="Move the character up or down on the canvas" />
                                                <span className="range-value" id="spOffsetVal">0px</span>
                                            </div>
                                        </FormRow>

                                        <FormRow>
                                            <label htmlFor="spZoom">Zoom</label>
                                            <div className="range-row">
                                                <input type="range" id="spZoom" min="10" max="300" defaultValue="100" title="Scale the character larger or smaller" />
                                                <span className="range-value" id="spZoomVal">100%</span>
                                            </div>
                                        </FormRow>
                                    </Panel>
                                </StageSection>

                                {/* Stage 3: Export */}
                                <StageSection className="stage disabled" id="spManualStage3">
        <StageHeader number={3} title="Export & Handoff" />
                                    <div className="btn-group">
                                        <button className="btn btn-secondary" id="spDownloadBtn" title="Download as 1280×720 PNG file">
                                            💾 Download PNG
                                        </button>
                                        <button className="btn-handoff" id="spHandoffBtn" title="Send this sprite to the Generate Video tab">
                                            Send to Generate Video →
                                        </button>
                                    </div>
                                </StageSection>
                            </div>

                            {/* Preview Sidebar */}
                            <div>
                                <Panel>
                                    <PanelTitle><PanelTitleIcon>👁️</PanelTitleIcon><PanelTitleText>Preview</PanelTitleText></PanelTitle>
                                    <div className="canvas-container" id="spCanvasContainer">
                                        <canvas id="spCanvas" width={1280} height={720}></canvas>
                                    </div>
                                    <div className="text-mono text-dim mt-1" style={{ fontSize: "0.7rem" }}>1280 × 720</div>
                                </Panel>
                            </div>
                        </MainLayout>
                    </div>

                    {/* ── Generative Mode ── */}
                    <div id="spriteGenerateMode" className="hidden">
                        <MainLayout>
                            <div>
                                <Panel>
                                    <PanelTitle><PanelTitleIcon>✨</PanelTitleIcon><PanelTitleText>Character Details</PanelTitleText></PanelTitle>

                                    <FormRow>
                                        <label htmlFor="sgCharName">Character Name <span className="text-gold">*</span></label>
                                        <input type="text" id="sgCharName" placeholder="e.g. Mirrime the Mage" title="Required — your character's name" />
                                    </FormRow>

                                    <FormRow>
                                        <label htmlFor="sgCharDesc">Character Description</label>
                                        <textarea id="sgCharDesc" rows={3} placeholder="Blue hair, red cape, golden feather cap, adventurer outfit..." title="Describe your character's appearance in detail" />
                                    </FormRow>

                                    <FormRow>
                                        <label htmlFor="sgCharAction">Character Action <span className="text-dim">(optional)</span></label>
                                        <input type="text" id="sgCharAction" placeholder="e.g. waving hello, casting a spell (defaults to neutral idle)" title="What is the character doing? Leave empty for a neutral idle pose" />
                                    </FormRow>

                                    <FormRow>
                                        <label>Art Style</label>
                                        <div className="mode-selector" id="sgStyle">
                                            <button className="mode-btn active" data-mode="anime" title="High-quality anime and JRPG, clean linework with bold dark outlines">✏️ Anime</button>
                                            <button className="mode-btn" data-mode="claymation" title="Stop-motion modelling clay, matte surfaces and tool marks">🧱 Clay</button>
                                            <button className="mode-btn" data-mode="painterly" title="Visible brushwork and soft blending, no hard outlines">🎨 Painted</button>
                                            <button className="mode-btn" data-mode="pixel" title="Limited palette, hard pixel edges, no anti-aliasing">👾 Pixel</button>
                                            <button className="mode-btn" data-mode="reference" title="Match the art style of your reference image instead of asking for one">🔗 Match Ref</button>
                                        </div>
                                    </FormRow>

                                    <FormRow>
                                        <label>Framing</label>
                                        <div className="mode-selector" id="sgFraming">
                                            <button className="mode-btn active" data-mode="bust" title="Waist up — upper body, chest, shoulders and head. No feet.">🖼️ Bust</button>
                                            <button className="mode-btn" data-mode="fullBody" title="Head to toe, including feet, with margin above and below">🧍 Full Body</button>
                                        </div>
                                    </FormRow>

                                    <FormRow>
                                        <label>Race Mode</label>
                                        <div className="mode-selector" id="sgRaceMode">
                                            <button className="mode-btn active" data-mode="normal" title="Standard human/anime character">👤 Normal</button>
                                            <button className="mode-btn" data-mode="kanolith" title="Kemonomimi — human face with animal ears and tail, no human ears">🐾 Kanolith</button>
                                            <button className="mode-btn" data-mode="zoalith" title="Full anthropomorphic beastfolk — snouts, fur, whiskers, animal features">🐲 Zoalith</button>
                                        </div>
                                    </FormRow>
                                </Panel>

                                <Panel>
                                    <PanelTitle><PanelTitleIcon>🖼️</PanelTitleIcon><PanelTitleText>References</PanelTitleText><Dim fontSize="$5">(optional)</Dim></PanelTitle>

                                    <TwoCol>
                                        <FormRow>
                                            <label>Character Reference</label>
                                            <div className="upload-zone" id="sgCharRefZone" title="Upload a reference image of your character — also used to auto-detect best key color" style={{ padding: "1rem" }}>
                                                <div className="upload-icon" style={{ fontSize: "1.5rem" }}>👤</div>
                                                <div className="upload-text" style={{ fontSize: "0.75rem" }}>Character Reference</div>
                                                <input type="file" id="sgCharRefInput" accept="image/*" />
                                            </div>
                                            <div id="sgCharRefPreview" className="hidden mt-1"></div>
                                        </FormRow>
                                        <FormRow>
                                            <label>Art Style Reference</label>
                                            <div className="upload-zone" id="sgStyleRefZone" title="Upload an image showing the art style you want" style={{ padding: "1rem" }}>
                                                <div className="upload-icon" style={{ fontSize: "1.5rem" }}>🎨</div>
                                                <div className="upload-text" style={{ fontSize: "0.75rem" }}>Style Reference</div>
                                                <input type="file" id="sgStyleRefInput" accept="image/*" />
                                            </div>
                                            <div id="sgStyleRefPreview" className="hidden mt-1"></div>
                                        </FormRow>
                                    </TwoCol>
                                </Panel>

                                <Panel>
                                    <PanelTitle><PanelTitleIcon>🎯</PanelTitleIcon><PanelTitleText>Generation Settings</PanelTitleText></PanelTitle>

                                    <FormRow>
                                        <label>Key Color</label>
                                        <div className="color-swatches" id="sgColorSwatches">
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
                                        <button className="btn btn-sm btn-secondary mt-1" id="sgAdvancedKeyBtn" title="Analyze the character reference to find the optimal key color" style={{ fontSize: "0.7rem" }}>
                                            🔬 Advanced Key Color
                                        </button>
                                    </FormRow>

                                    {/* Advanced Key Color Modal */}
                                    <div id="advKeyModal" className="modal-overlay hidden">
                                        <Panel className="modal-panel" maxWidth={800} width="95%">
                                            <PanelTitle>
                                                <PanelTitleIcon>🔬</PanelTitleIcon><PanelTitleText flex={1}>Advanced Key Color Analysis</PanelTitleText>
                                                <button className="btn btn-sm btn-danger" id="advKeyClose" style={{ marginTop: "-4px" }}>✕</button>
                                            </PanelTitle>
                                            <p className="text-dim" style={{ fontSize: "0.8rem", margin: "0.5rem 0" }}>
                                                Draw a rectangle around the <strong>character only</strong> (exclude background), then click <strong>Analyze</strong>.
                                            </p>
                                            <div id="advKeyCanvasWrap" style={{ position: "relative", display: "inline-block", maxWidth: "100%", cursor: "crosshair", border: "1px solid rgba(219,184,88,0.3)", borderRadius: "6px", overflow: "hidden" }}>
                                                <canvas id="advKeyCanvas" width={760} height={500}></canvas>
                                                <div id="advKeySelection" style={{ position: "absolute", border: "2px dashed #dbb858", background: "rgba(219,184,88,0.1)", display: "none", pointerEvents: "none" }}></div>
                                            </div>
                                            <div className="btn-group mt-1">
                                                <button className="btn btn-secondary" id="advKeyClearBtn">🗑️ Clear Selection</button>
                                                <button className="btn btn-primary" id="advKeyAnalyzeBtn" disabled>🔍 Analyze Selection</button>
                                            </div>
                                            <div id="advKeyResults" className="mt-1 hidden">
                                                <PanelTitle><PanelTitleIcon>📊</PanelTitleIcon><PanelTitleText fontSize="$6">Results — Best Key Color</PanelTitleText></PanelTitle>
                                                <div id="advKeyResultsList"></div>
                                            </div>
                                        </Panel>
                                    </div>

                                    <FormRow>
                                        <label>Provider</label>
                                        <div className="seg-toggle" id="sgProvider">
                                            <button className="seg-btn active" data-mode="openai" title="Generate with OpenAI. Uses your OpenAI API key.">OpenAI</button>
                                            <button className="seg-btn" data-mode="xai" title="Generate with Grok. Uses your xAI API key from Settings.">Grok</button>
                                            <button className="seg-btn" data-mode="comfyui" title="Generate locally with ComfyUI. Configure the address in Settings.">ComfyUI</button>
                                        </div>
                                    </FormRow>

                                    <FormRow>
                                        <label>Simultaneous Generations</label>
                                        <div className="gen-count" id="sgGenCount">
                                            <button className="gen-count-btn active" data-count="1" title="Generate 1 image">1</button>
                                            <button className="gen-count-btn" data-count="2" title="Generate 2 images simultaneously">2</button>
                                            <button className="gen-count-btn" data-count="3" title="Generate 3 images simultaneously">3</button>
                                            <button className="gen-count-btn" data-count="4" title="Generate 4 images simultaneously">4</button>
                                        </div>
                                    </FormRow>

                                    <button className="btn-handoff mt-2" id="sgGenerateBtn" title="Generate sprite(s) using GPT Image 2">
                                        ✨ Generate Sprite
                                    </button>

                                    <div className="progress-container" id="sgProgress">
                                        <div className="progress-bar"><div className="fill" id="sgProgressFill"></div></div>
                                        <div className="progress-text">
                                            <span id="sgProgressText">Generating...</span>
                                            <button className="btn btn-sm btn-danger" id="sgCancelBtn">Cancel</button>
                                        </div>
                                    </div>

                                    <div id="sgStatus"></div>
                                </Panel>

                                {/* Results */}
                                <div id="sgResultsSection" className="hidden">
                                    <Panel>
                                        <PanelTitle><PanelTitleIcon>🖼️</PanelTitleIcon><PanelTitleText>Results</PanelTitleText></PanelTitle>
                                        <div className="results-grid" id="sgResultsGrid"></div>
                                        <div className="mt-2 btn-group">
                                            <button className="btn btn-secondary" id="sgToManualBtn" title="Send the selected sprite to Manual Upload for offset/zoom adjustments">
                                                🎨 Send to Manual Upload
                                            </button>
                                            <button className="btn-handoff" id="sgHandoffBtn" title="Send the selected sprite to Generate Video">
                                                Send to Generate Video →
                                            </button>
                                        </div>
                                    </Panel>
                                </div>
                            </div>

                            {/* Preview Sidebar */}
                            <div>
                                <Panel>
                                    <PanelTitle><PanelTitleIcon>👁️</PanelTitleIcon><PanelTitleText>Preview</PanelTitleText></PanelTitle>
                                    <div className="canvas-container" id="sgCanvasContainer">
                                        <canvas id="sgCanvas" width={1280} height={720}></canvas>
                                    </div>
                                    <div className="text-mono text-dim mt-1" style={{ fontSize: "0.7rem" }}>1280 × 720 · GPT Image 2</div>
                                </Panel>
                            </div>
                        </MainLayout>
                    </div>
    </>
);

export const SpritePrepTab = memo(SpritePrepTabView);
