/**
 * Video preparation: choose the loop and how it plays.
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
import { Panel, PanelTitle, PanelTitleText, PanelTitleIcon, MainLayout, FormRow, StageSection, StageHeader, GoldDivider } from "../ui/primitives.tsx";

const VideoPrepTabView = (): ReactNode => (
    <>
                    <MainLayout>
                        <div>
                            {/* Stage 1: Upload */}
                            <StageSection className="stage" id="vpStage1">
        <StageHeader number={1} title="Load Video" />
                                <Panel>
                                    <div className="upload-zone" id="vpUploadZone" title="Drop a video file (MP4, WebM, MOV) or click to browse">
                                        <div className="upload-icon">🎬</div>
                                        <div className="upload-text">Drop video file here or click to browse</div>
                                        <div className="upload-hint">MP4, WebM, MOV</div>
                                        <input type="file" id="vpFileInput" accept="video/mp4,video/webm,video/quicktime,.mov" />
                                    </div>
                                    <div id="vpFromVideoGen" className="hidden mt-1">
                                        <div className="status-msg info">
                                            <span>📌</span> Video loaded from Generate Video
                                        </div>
                                    </div>
                                </Panel>
                            </StageSection>

                            {/* Stage 2: Loop Builder */}
                            <StageSection className="stage disabled" id="vpStage2">
        <StageHeader number={2} title="Loop Builder" />
                                <Panel>
                                    {/* Video Canvas */}
                                    <div className="canvas-container" id="vpCanvasContainer">
                                        <canvas id="vpCanvas"></canvas>
                                    </div>

                                    {/* Playback Controls */}
                                    <div className="scrubber-container mt-1">
                                        <div className="scrubber-controls">
                                            <button className="btn btn-sm btn-icon" id="vpPrevFrame" title="Previous frame (←)">⏮</button>
                                            <button className="btn btn-sm btn-icon" id="vpPlayBtn" title="Play/Pause video">▶️</button>
                                            <button className="btn btn-sm btn-icon" id="vpNextFrame" title="Next frame (→)">⏭</button>
                                        </div>
                                        <input type="range" id="vpScrubber" min="0" max="100" defaultValue="0" title="Scrub through video frames" />
                                        <span className="scrubber-info" id="vpFrameInfo">0 / 0</span>
                                    </div>

                                    {/* Onion Skin */}
                                    <div className="onion-skin-row mt-1">
                                        <label className="toggle-switch" title="Overlay frame 0 at 50% opacity to help align loop point">
                                            <input type="checkbox" id="vpOnionSkin" />
                                            <span className="slider"></span>
                                        </label>
                                        <label htmlFor="vpOnionSkin" style={{ marginBottom: "0" }}>Onion Skin (Frame 0 overlay)</label>
                                    </div>

                                    {/* Loop Point */}
                                    <div className="flex items-center justify-between mt-2">
                                        <div className="btn-group">
                                            <button className="btn btn-sm btn-secondary" id="vpSetLoopStartBtn" title="Set the current frame as the first frame of the loop">📍 Set Loop Start</button>
                                            <button className="btn btn-sm btn-secondary" id="vpSetLoopEndBtn" title="Set the current frame as the last frame of the loop">🏁 Set Loop End</button>
                                            <button className="btn btn-sm btn-secondary" id="vpClearLoopBtn" title="Clear the loop point">✖ Clear</button>
                                            <button className="btn btn-sm btn-accent" id="vpPreviewLoopBtn" title="Preview the loop animation">▶ Preview Loop</button>
                                        </div>
                                        <span className="text-mono text-muted" id="vpLoopInfo" style={{ fontSize: "0.75rem" }}></span>
                                    </div>
                                </Panel>
                            </StageSection>

                            {/* Stage 3: Loop Mode */}
                            <StageSection className="stage disabled" id="vpStage3">
        <StageHeader number={3} title="Output Mode" />
                                <Panel>
                                    <FormRow>
                                        <label>Loop Mode</label>
                                        <div className="seg-toggle" id="vpLoopMode">
                                            <button className="seg-btn active" data-mode="none" title="No looping — export frames as-is">No Loop</button>
                                            <button className="seg-btn" data-mode="pingpong" title="Forward then reverse (0→N→0) for seamless bounce loop">Ping-Pong</button>
                                            <button className="seg-btn" data-mode="reverse" title="Export frames in reverse order only">Reverse</button>
                                        </div>
                                    </FormRow>

                                    <GoldDivider />

                                    <button className="btn-handoff mt-2" id="vpHandoffBtn" title="Send the prepared video to Model Exporter">
                                        Send to Model Exporter →
                                    </button>
                                </Panel>
                            </StageSection>
                        </div>

                        {/* Preview Sidebar */}
                        <div>
                            <Panel>
                                <PanelTitle><PanelTitleIcon>📊</PanelTitleIcon><PanelTitleText>Video Info</PanelTitleText></PanelTitle>
                                <div id="vpVideoInfo" className="text-muted" style={{ fontSize: "0.8rem" }}>
                                    <div>No video loaded</div>
                                </div>
                            </Panel>
                        </div>
                    </MainLayout>
    </>
);

export const VideoPrepTab = memo(VideoPrepTabView);
