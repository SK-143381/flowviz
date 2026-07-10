# Decision-Confirmation + Dependency-Aware Layered Generation for BLV-Accessible System Architecture Diagrams

> Transcription of the uploaded `write-up.pdf` (lit-review + project-plan), preserved in full for reference alongside the implementation. See [architecture.md](./architecture.md) for how the codebase realizes this design.

---

## Part 1 — Literature Review

### TL;DR

- The proposed system — combining (1) an HCXAI-grounded loop in which the model explicitly enumerates and confirms its latent interpretive decisions with a BLV user, and (2) dependency-aware, semantically-labeled layers (nodes/edges/labels) for non-visual regional editing — is **genuinely novel**: no existing paper combines all four pillars (self-enumerated interpretive decisions + XAI confirmation; dependency-aware semantic layers; BLV users; node-and-edge/architecture diagrams via AI generation).
- The two closest works differ sharply and defensibly: **GenAssist** (Huh, Peng, & Pavel, UIST 2023) describes and verifies images *after* generation but never enumerates the model's own interpretive decisions for pre-commitment confirmation and has no layer/dependency model; **AltCanvas** (Lee et al., ASSETS 2024) offers a tile-per-object constructive canvas for illustrations but its tiles are independent objects (no inter-layer dependency propagation) and it explicitly targets scene illustrations, not node-edge diagrams.
- The nearest conceptual competitor to mechanism (1), the DeepMind "belief graph" proactive T2I agent (Hahn et al., ICML 2025), is sighted-user-oriented, holistic (no layers), non-accessibility, and its editable-belief interface is an admitted hypothetical prototype — leaving the BLV + diagram + dependency-aware-layer synthesis open.

### Key Findings

1. The 23 papers cluster into six themes; only two (GenAssist, AltCanvas) are close prior work, and both are differentiable on precise, defensible grounds.
2. **Mechanism (1)** — model self-enumeration of interpretive decisions + explainable confirmation dialogue: has partial analogues in T2I prompt-disambiguation work (TIED, Visual Co-Adaptation, DeepMind belief-graph agents), but none frame it via HCXAI, none target BLV users, and all resolve ambiguity in the *prompt* rather than surfacing the model's own downstream rendering decisions.
3. **Mechanism (2)** — dependency-aware semantic layers: has analogues in non-accessibility layered/compositional diffusion (LayoutDiffusion, LayerDiffusion, Qwen-Image-Layered, LayerCraft), but these are generation-quality methods with no audio description, no BLV interaction, and no diagram semantics (node/edge/label).
4. No existing tool lets BLV users author system architecture diagrams, flowcharts, or UML-style node-edge diagrams via AI generation; existing diagram-accessibility work (TADA, AI-Vision, Image Explorer) is about consuming/exploring existing diagrams, not creating them.
5. HCXAI (Ehsan & Riedl) provides a strong, citable theoretical grounding for mechanism (1): explainability as a two-way, contestable, sociotechnical process tailored to the seeker.

---

### Literature Review / Annotated Bibliography

#### Theme A — Bias, stereotype, and safety in text-to-image generation

**Bianchi, Kalluri, Durmus, Ladhak, Cheng, Nozza, Hashimoto, Jurafsky, Zou, & Caliskan (2023)**, "Easily Accessible Text-to-Image Generation Amplifies Demographic Stereotypes at Large Scale," FAccT 2023, pp. 1493–1504.
(a) A large-scale audit showing that ordinary prompts (traits, occupations, objects) cause Stable Diffusion to produce stereotyped outputs and, crucially, to amplify real-world disparities. The paper states verbatim that "99% of the generated software developer images are represented as white according to a pre-trained model, while in the country where the foundational training dataset was constructed (the U.S.), only 56% of software developers" identified as white — a comparison drawn against U.S. Bureau of Labor Statistics 2021 data — and that prompt-based mitigation attempts largely failed.
(b) Relevance: motivates *why* a BLV user cannot trust silent defaults — the model injects unrequested demographic/content decisions the user cannot see.
(c) Limitation: it is an audit, not a system; offers no interaction remedy.
(d) Relation to us: it is a strong justification for our decision-explication loop (the model's latent choices are exactly the ones Bianchi et al. show are biased and invisible), but does nothing to surface or confirm those choices interactively.

**Zhang, Chen, Chai, Wu, Lagun, Beeler, & De la Torre (2023)**, "ITI-GEN: Inclusive Text-to-Image Generation," ICCV 2023, pp. 3969–3980.
(a) A method that learns attribute-specific token embeddings from reference images ("a picture is worth a thousand words") to make outputs uniformly span attribute categories (e.g., skin tone, age) without fine-tuning.
(b) Relevance: an inclusivity/control mechanism for generation.
(c) Limitation: it controls *demographic attribute distributions*, requires reference image sets, and is not interactive, not accessibility-facing, not diagram-oriented.
(d) Relation: shares our goal of steering the model toward user intent, but via embedding manipulation rather than an explainable confirmation dialogue; no BLV interface, no layers.

**Yoon, Yu, Patil, Yao, & Bansal (2025)**, "SAFREE: Training-Free and Adaptive Guard for Safe Text-to-Image and Video Generation," ICLR 2025.
(a) A training-free method that detects a toxic-concept subspace in text-embedding space and steers prompt embeddings away from it, plus adaptive re-attention in latent space; the authors report SAFREE "demonstrates state-of-the-art performance for suppressing unsafe content in T2I generation (reducing 22% across 5 datasets) compared to other training-free methods," without altering model weights.
(b) Relevance: an example of steering/guarding generation while preserving intended semantics.
(c) Limitation: safety-focused, non-interactive, no accessibility framing.
(d) Relation: like us it intervenes in the generation pipeline to change what gets rendered, but it does so automatically and invisibly — the opposite of our transparency/confirmation goal.

#### Theme B — Tactile and pictogram generation for accessibility

**Dzhurynskyi, Mayik, & Mayik (2024)**, "Enhancing accessibility: automated tactile graphics generation for individuals with visual impairments," Computation, 12(12), 251.
(a) An automated pipeline for producing tactile graphics from source images.
(b/c/d) Relevant to output rendering for BLV users, but it concerns automatic tactile conversion, not interactive authoring, decision confirmation, or diagram structure.

**Khan, Choubineh, Shaaban, Akkasi, & Komeili (2025)**, "TactileNet," arXiv:2504.04722.
(a) The first dataset + framework fine-tuning Stable Diffusion (LoRA + DreamBooth) to generate embossing-ready 2D tactile templates; 92.86% expert-rated adherence to tactile standards, SSIM 0.538 vs. expert designs, scaled to 32,000 images (7,050 high-quality) across 66 classes, with prompt editing for adding/removing details.
(b) Relevance: AI generation of accessible visual artifacts.
(c) Limitation: it augments (not replaces) human designers; produces static templates, no interactive confirmation, no diagram/layer semantics.
(d) Relation: an output-side tactile complement to our system, not a competitor on interaction or novelty.

**Leiva, Goicovich, González, & Vigneau (2025)**, "PICTOS-AI: Generating Cognitively Accessible Pictograms with Artificial Intelligence for Inclusive Visual Communication," IEEE CHILECON 2025, pp. 1–7.
(a) AI generation of pictograms for cognitive accessibility/AAC.
(b/c/d) Targets cognitive accessibility and pictogram style, not BLV non-visual editing or diagram authoring; no decision-confirmation loop.

**Dickenmann, Merzouki, Laguna, Nowak-Tran, Palumbo, Vogt, & Binder (2026)**, "Steering Generative Models for Accessibility: EasyRead Image Generation," CHI EA '26.
(a) LoRA fine-tuning of Stable Diffusion v1.5 on a curated pictogram corpus (ARASAAC, OpenMoji, LDS) to produce simple, consistent EasyRead pictograms; introduces an "EasyRead score" (pixel + semantic metrics) as the first reproducible measure of "EasyReadness."
(b) Relevance: steering diffusion toward accessibility-constrained visual styles.
(c) Limitation: cognitive-accessibility (not BLV), style-steering (not interactive), no confirmation loop, no layers/diagrams.
(d) Relation: a steering-for-accessibility sibling; distinct on user group, interaction, and structure.

#### Theme C — General accessible-communication T2I evaluation (Easy-to-Read / Easy Language)

**Anschütz, Sylaj, & Groh (2024)**, "Images speak volumes: User-centric assessment of image generation for accessible communication," TSAR 2024, pp. 27–40.
(a) The authors "benchmarked seven, four open- and three closed-source, image generation models" — generating 2,240 images from 80 structured prompts, evaluated with FID, CLIPScore, and TIFA plus a user study with the Easy-to-Read (E2R) target group — and conclude that "some of the models show remarkable performance, but none of the models are ready to be used at a larger scale without human supervision."
(b) Relevance: empirical evidence that unsupervised generation is unreliable for accessibility use.
(c) Limitation: evaluation study, no system, no interactive remedy.
(d) Relation: supports our "human-in-the-loop confirmation is necessary" premise.

**Souayed & Belkiss (2025)**, "Template-Based Text-to-Image Alignment for Language Accessibility: A Study on Visualizing Simplified Text," PhD Thesis, University of Zurich.
(a) Template-based alignment of generated images to simplified text for language accessibility.
(b/c/d) Language-accessibility (E2R) focus; template alignment rather than interactive decision confirmation; not BLV, not diagrams.

**Zatserkovnyi, Kutsyk, Zatserkovna, Maik, & Popov (2024)**, "Enhancing adapted print publication accessibility via text-to-image synthesis," CEUR Workshop Proceedings, vol. 3736, pp. 86–92.
(a) Uses T2I synthesis to enhance accessibility of adapted print publications.
(b/c/d) Print-publication accessibility; generation for adapted content, not interactive BLV authoring or diagrams.

**Weber, Beyer, & Rothe (n.d.)**, "Evaluating Diffusion-Based Image Generation for Easy Language Accessibility."
(a) Evaluates diffusion generation for Easy Language.
(b/c/d) Evaluation study in the E2R tradition; no BLV editing, no confirmation loop, no diagram structure.

**Muniraj & Saravanan (2024)**, "Enhancing AI-Generated Image Accessibility: Challenges and Solutions."
(a) A challenges-and-solutions overview of AI-generated image accessibility.
(b/c/d) Framing/overview contribution; useful for motivation, not a competing system.

**Bansal, Nawal, Chamola, & Herencsar (2024)**, "Revolutionizing Visuals: The Role of Generative AI in Modern Image Generation," ACM TOMM, 20(11), pp. 1–22.
(a) A survey of generative-AI image generation (GANs, VAEs, diffusion) covering quality, semantic alignment, control, and sustainability trade-offs.
(b/c/d) Background/state-of-the-art reference for the generative substrate; not accessibility- or interaction-specific.

**Goetschalckx, Wang, Willems, & De Schepper (2026)**, "Generative Artificial Intelligence to Tackle Visual Data Accessibility Challenges," in Artificial Intelligence, Data and Robotics, pp. 105–135, Springer.
(a) A book chapter surveying how generative AI can address visual-data accessibility challenges.
(b/c/d) Survey/agenda contribution; frames the problem space our system occupies but proposes no comparable mechanism.

#### Theme D — BLV-specific interactive tools for consuming/creating visual content

**Zhao, Lai, Guo, Liu, He, & Zhao (2024)**, "AI-Vision: A Three-Layer Accessible Image Exploration System for People with Visual Impairments in China," Proc. ACM IMWUT, 8(3), 145:1–145:27.
(a) An Android hierarchical image-*exploration* system offering three layers of information — general image description, local object description, and metadata — validated in a 7-day diary study with 10 participants.
(b) Relevance: uses a "three-layer" hierarchy to structure non-visual access.
(c) Limitation: the "layers" are description-granularity levels for *consuming* existing images, not editable, dependency-linked generative layers; no authoring, no generation.
(d) Relation: important to distinguish — despite the "layer" terminology, AI-Vision is a consumption/exploration system with no generation, no editing, and no inter-layer dependency reasoning.

**Raman (2025)**, "'Somewhere Between Images and Art': How Blind Creators Engage with AI Image Generators," ASSETS 2025, pp. 1–5.
(a) A qualitative study of six BLV artists using Midjourney via guided prompting and interviews; participants used it for inspiration, evaluation, and fragment generation while drawing firm authorship boundaries, and voiced explainability concerns about how prompts map to images and how models "learn" about blindness.
(b) Relevance: direct evidence BLV creators want explainability of the prompt→image mapping.
(c) Limitation: a small formative study, no system.
(d) Relation: strong empirical motivation for mechanism (1) — participants explicitly wanted to understand the opaque interpretive step our loop makes explicit.

**Meriç, White, Suárez Zapico, Yanovich, Koby-Hirschmann, & Fiebrink (2024)**, "Imagination Tool: Accessible AI Image Generation Software to Support Child Ideation and Creative Expression," ICCC 2024.
(a) Accessible AI image-generation software supporting children's ideation and creative expression.
(b/c/d) Accessibility for children/ideation, not BLV non-visual editing or diagrammatic structure; no decision-confirmation or dependency-aware layers.

**Taheri, Izadi, Shriram, Rostamzadeh, & Kane (2023)**, "Breaking Barriers to Creative Expression: Co-Designing and Implementing an Accessible Text-to-Image Interface," arXiv:2309.02402.
(a) A co-designed alternative UI that reduces typing effort for prompt entry by offering LLM-generated suggestions, supporting users with a range of abilities to make visual art.
(b) Relevance: input-side accessibility of T2I prompting.
(c) Limitation: focuses on prompt *entry* ergonomics, not verification of outputs, not BLV-specific non-visual editing, no layers.
(d) Relation: complementary input-accessibility work; orthogonal to our decision-confirmation and layer mechanisms.

#### Theme E — Co-creative AI accessibility surveys

**Preston & Rezwana (2025)**, "The Accessibility Landscape of Co-Creative AI Systems: Analysis, Insights and Recommendations," ACM IUI Workshops 2025 (HAI-GEN), CEUR-WS Vol-3957.
(a) An accessibility audit of co-creative AI systems (generation, drawing, coding) using automated tools (WAVE) and NVDA; finds many systems fail basic accessibility standards, with critical usability barriers for people with disabilities.
(b) Relevance: documents the systemic inaccessibility our work targets.
(c) Limitation: an audit/recommendations paper, not a system.
(d) Relation: provides the "state of the field is broken" grounding for our contribution.

#### Theme F — Priority deep-dive prior work

**GenAssist** (Huh, Peng, & Pavel, 2023, UIST '23, pp. 1–17; Best Paper Award)

*What it does (pipeline).* GenAssist makes T2I results accessible to BLV creators by describing and comparing candidate images produced from a prompt (they use MidJourney's four-candidate output). Its pipeline has three model roles: GPT-4 generates visual questions; BLIP-2 answers them (VQA); and GPT-4 summarizes. Concretely it runs (1) **prompt verification** — GPT-4 decomposes the prompt into per-part verification questions ("Is there a chef?", "Are the parents present?"), BLIP-2 answers them per image, GPT-4 summarizes similarities/differences; (2) **visual content & style extraction** — a fixed set of "prompt guideline questions" (setting, subjects, objects, emotion, usage, medium, lighting, perspective, colors, errors) answered via BLIP-2, Detic (object detection, 0.3 confidence), and CLIP (style/error via answer-choice similarity); and (3) **per-image descriptions and comparison descriptions** built from BLIP-2 captions plus image-specific questions ("generate 10 visual questions likely asked by BLV individuals"). Output is a screen-reader-navigable table (images as columns, questions as rows) where users can also add their own questions. Evaluation: a formative study with 8 BLV creators (yielding design opportunities D1–D5) and a within-subjects study with 12 BLV creators against a baseline (caption + object detection + VQA); GenAssist rated more useful for understanding similarities/differences and raised satisfaction. Pipeline accuracy exceeded 90% for most categories; the paper reports that "in the coverage of differences, GenAssist spotted more than twice the number of total differences than the human describers (4.55 vs. 2.25)."

*"Layers"/structure.* GenAssist has no layer model. Its only structure is the question×image comparison table for description; the underlying image is a flat raster it never decomposes into editable semantic components.

*Prompt refinement.* GenAssist supports iteration only indirectly: by reading descriptions and differences, the user manually rewrites the prompt and regenerates. It does not enumerate the model's interpretive decisions, does not confirm them before/during generation, and provides no localized editing; regeneration discards prior state.

*Stated limitations/future work.* The authors note descriptions depend on imperfect VLM outputs (BLIP-2 hallucination, Detic/CLIP errors, especially medium/perspective/error detection), that they did not build active prompt-authoring support (D1 left to future work: "future work should explore how to actively support creators in authoring prompts"), and that a formative participant explicitly wished the model would "behave more like a wizard – asking me a series of questions."

*Differentiation from our idea.* GenAssist operates entirely post hoc and descriptively: it tells the user what the model already produced. Our contribution is pre-commitment and generative-control: the model enumerates the interpretive decisions it is about to make and confirms them via an HCXAI dialogue, and represents the diagram as dependency-aware editable layers so that corrections are localized. GenAssist's own participants asked for exactly the "wizard" interaction we propose, and its future-work section leaves prompt-authoring/decision support open.

**AltCanvas** (Lee, Kohga, Landau, O'Modhrain, & Subramonyam, 2024, ASSETS '24, pp. 1–22)

*What it does (tile/object model).* AltCanvas is a generative-AI illustration tool for BVI users combining a **tile view** (an accessible alternative to a drawing canvas) with an image view. Each tile represents a single object; the canvas starts as one tile and dynamically expands in eight directions so users can place objects at relative positions. Users add objects by speech-to-text → text-to-image (the system confirms the detected utterance: "Detected: Create an image of a dog. Press Enter to confirm"), then receive speech descriptions ("The dog is a golden retriever… The image measures 100 by 100"). Editing (location, size, rearrange, delete) is done via keyboard + sonification (stereo panning, earcons, a "radar scan"). Tiles encode only relative position (not absolute size/distance; an earlier absolute-grid design was abandoned as too inconsistent). Final output renders as a color illustration or a vector for tactile-graphic printing. Grounded in a formative study with 5 blind creators (design considerations D1–D5) and evaluated across 14 BVI participants total.

*Editing without disturbing other objects.* Because each tile is an independent object, moving/resizing/deleting one object does not alter others, but this is naive independence: there is no dependency propagation. Adding an object does not automatically create or update relationships to other objects; there is no notion of an edge whose existence depends on two nodes, or a label that must update when a node changes.

*Stated limitations/future work.* The authors note AltCanvas focuses on object illustrations and struggles with complex/compound editing operations and infographic-style content; sonification has a learning curve; and generation quality/reliability limits remain.

*Differentiation from our idea.* AltCanvas is the closest analog to a "layered" approach, but three distinctions are decisive: (1) its units are independent objects, not dependency-aware layers; it has no mechanism to reason about ripple effects (adding a node → new edges/labels) or to confirm propagated changes; (2) it targets scene illustrations (a dog, a ball, a park), explicitly not node-edge/architecture diagrams, whose primitives are precisely nodes, edges, and labels with structural interdependencies; and (3) its only "confirmation" is speech-recognition confirmation of the input utterance, not enumeration/confirmation of the model's interpretive decisions (implied cardinality, protocols, directionality). Our system's dependency model and HCXAI decision loop are outside AltCanvas's design space.

---

### Task 1 — Novelty verification against the broader literature

**(a) Systems that enumerate/confirm the model's own latent interpretive decisions via an XAI-style dialogue.** The closest is Hahn, Zeng, Kannen, Galt, Badola, Kim, & Wang (Google DeepMind), "Proactive Agents for Multi-Turn Text-to-Image Generation Under Uncertainty," ICML 2025 (PMLR v267, pp. 21591–21628; extended version arXiv:2412.06771). It builds a proactive T2I agent that asks clarification questions when uncertain and represents intent as an editable "belief graph" (nodes = entities, edges = relations; entities tagged explicit/implicit/background with appearance probabilities and importance-to-ask scores, derived by Gemini 1.5; images by Imagen 3). Questions are selected by an uncertainty×importance acquisition function; the best variant used principles without an explicit graph. Evaluation used LLM self-play plus human studies: the authors report that "at least 90% of human subjects found these agents and their belief graphs helpful," with a breakdown of "91% perceived clarifications as helpful, 88% for entity graphs, and 86% for relationship graphs," and humans preferred agent images over single-turn T2I in more than 80% of pairs. Crucially different from us: it has zero accessibility/BLV framing (target users are general users, artists, designers), it is holistic with no layers and no dependency-aware regional editing, its editable-belief interface is explicitly an "intentionally simple," hypothetical research prototype (not an evaluated accessible UI), and its belief graph models prompt intent uncertainty, not the model's downstream rendering decisions surfaced for pre-commitment confirmation. Related prompt-disambiguation work: the TIED framework ("Resolving Ambiguities in Text-to-Image Generative Models," Amazon Science, with the TAB benchmark), Visual Co-Adaptation (Zhang et al., 2025, human–machine co-adaptation with multi-turn disambiguation), and T2I-Copilot (2025, training-free multi-agent); all resolve prompt ambiguity through clarifying questions but likewise target sighted general users, use no HCXAI framing, and have no layer/diagram or accessibility component. **Gap confirmed:** no system frames decision-explication via HCXAI for BLV users.

**(b) Dependency-aware, semantically-labeled, independently-audio-describable/editable layers.** Non-accessibility layered/compositional diffusion is a mature area: LayoutDiffusion (Zheng et al., CVPR 2023, arXiv:2303.17189) for layout-to-image control; LayerDiffusion / Text2Layer / LayerDiff / ART / Qwen-Image-Layered (arXiv:2512.15603) for RGBA-layer decomposition and isolated editing; LayerBind (arXiv:2603.05769) for regional/occlusion control; and LayerCraft (arXiv:2504.00010), which uses chain-of-thought reasoning and a "dependency-aware 3D scene graph" for layer-wise editable construction — the single closest match on the dependency-aware layer concept. But every one of these is a generation-quality/controllability method: no audio description, no non-visual interaction, no BLV users, and no diagram semantics (node/edge/label). AI-Vision (Zhao et al., 2024) uses "three layers" but only as description-granularity for consuming images. **Gap confirmed:** dependency-aware semantic layers have never been instantiated as an accessible, audio-describable, BLV-editable representation.

**(c) Tools for BLV users to author system architecture / software / flowchart / node-edge diagrams via AI generation.** None found. Diagram-accessibility research addresses consumption: TADA (Zhao, Sukhai, & Somanath, CHI 2024, arXiv:2311.04502) makes existing node-link diagrams explorable via touch + musical tones/speech; Image Explorer (Lee, Herskovitz, Peng, & Guo, CHI 2022 / ASSETS 2021) provides multi-layered touch exploration of images; recent work on semantic segmentation of node-edge diagrams parses existing diagrams for BLV access. Industry accessible-diagram guidance (Microsoft Visio navigation order, ARIA-annotated SVG flowcharts per Léonie Watson) supports authoring/reading by sighted or keyboard users but is neither AI-generative nor non-visual-first. **Gap confirmed:** AI-generative diagram authoring by BLV users is unaddressed.

**(d) Chain-of-thought / reasoning-trace transparency as an accessibility/confirmation mechanism for creative or diagrammatic generation.** LayerCraft uses CoT internally for generation quality but not as a user-facing confirmation mechanism and not for accessibility. Editable/conversational XAI work — "Editable XAI: Toward Bidirectional Human-AI Alignment with Co-Editable Explanations" (user edits explanation rules in a decision-tree flowchart, tabular ML, sighted) and an interview study, "Explainable AI for Blind and Low-Vision Users: Navigating Trust, Modality, and Interpretability in the Agentic Era" (finds BLV users value conversational explanations and want to verify AI decisions) — motivate the direction but neither is a generative diagram system with layered editing. **Gap confirmed:** using a reasoning model's decision trace as a BLV-facing confirmation mechanism for diagram generation is novel.

**State-of-the-art context for regional editing (non-accessibility).** For the related-work "context" paragraph, the state of the art in localized/region-controllable diffusion editing includes inpainting, layout-to-image (LayoutDiffusion), compositional/layered diffusion (LayerDiffusion, Qwen-Image-Layered, LayerBind, MRT), and CoT-driven layered construction (LayerCraft). These solve "localized editing without collateral changes" pixel-wise/latent-wise; our contribution is distinct in operating over semantic diagram layers with modeled inter-layer dependencies exposed through a non-visual, confirmable interface.

### Task 2 — HCXAI principles (grounding for mechanism 1)

Human-Centered Explainable AI (HCXAI), introduced by Ehsan & Riedl (2020, "Human-centered Explainable AI: Towards a Reflective Sociotechnical Approach," arXiv:2002.01092; HCII 2020 LNCS 12424) and developed through the CHI HCXAI workshop series (Ehsan et al., 2022 "Beyond Opening the Black-Box"; 2023 "Coming of Age"; 2024 "Reloading Explainability in the Era of LLMs," CHI EA), rests on several tenets directly relevant to our confirmation loop:

- **Not everything important is inside the black box**: "critical insights can lie outside it, because that's where the humans are"; explainability must center *who* is seeking the explanation and their context, values, and situated needs.
- **Explanation as a two-way, iterative, contestable dialogue**, not a one-shot output: aligning with our loop where the model states decisions and the user contests/corrects them before commitment.
- **Explainability as a sociotechnical process**, not a model property: foregrounding user agency, actionability, and appropriation (cf. seamful design's emphasis on "actionability, contestability, and appropriation" and "reluctance to simplify").
- **Tailoring explanations to the seeker**: for BLV users this mandates a non-visual, conversational modality, which our audio confirmation interface satisfies.

These principles let us frame mechanism (1) not as ad-hoc UI but as a principled operationalization of HCXAI: the model's latent interpretive decisions become the "explanation," rendered contestable in an accessible two-way dialogue.

### Synthesized gap statement

Prior work has independently established each ingredient but never their synthesis. Bias/safety audits (Bianchi et al.; SAFREE) prove the model silently injects consequential, often biased decisions; accessible-communication evaluations (Anschütz et al.) prove unsupervised generation is unreliable for accessibility; BLV creator studies (Raman; GenAssist's formative "wizard" wish) prove BLV users want to understand and steer the opaque prompt→image mapping. GenAssist makes results describable but only post hoc, flat, and non-editable. AltCanvas makes generation constructive for BLV users but with independent objects (no dependency propagation) and for scene illustrations, not node-edge diagrams. The DeepMind belief-graph agent and prompt-disambiguation work introduce clarification dialogues and even editable intent graphs, but for sighted general users, holistically (no layers), with no HCXAI framing and an admittedly hypothetical interface. Layered/compositional diffusion (LayoutDiffusion, Qwen-Image-Layered, LayerCraft's dependency-aware graph) achieves localized editing but purely as a generation method with no accessibility, no audio, and no diagram semantics. Diagram-accessibility tools (TADA, AI-Vision) address only *consumption* of existing diagrams.

**No system combines (i) a reasoning model that explicitly enumerates its latent interpretive decisions and confirms them through an HCXAI-grounded, non-visual dialogue, with (ii) a dependency-aware, semantically-labeled layer representation (nodes/edges/labels) whose edits trigger reasoned, user-confirmable propagation, (iii) for BLV users, (iv) in the concrete domain of system architecture diagrams.** This four-way synthesis is the novel contribution, simultaneously advancing accessible generation and the general problem of localized, collateral-free editing in generative diagramming.

---

## Part 2 — Project Plan

### 1. Scope Statement

The literature review established that no existing system combines (i) a reasoning model that explicitly enumerates its own latent interpretive decisions and confirms them with the user through an HCXAI-grounded dialogue, (ii) a dependency-aware, semantically-labeled layer representation that supports collateral-free regional editing, (iii) blind and low-vision (BLV) users as the target population, and (iv) system architecture diagrams as the domain.

### 2. Design Rationale: Why a Structured Representation, Not Raw Diffusion

First, the accessible-communication literature has already shown that unsupervised diffusion output is not trustworthy enough to hand to a BLV user without mediation: benchmarking seven text-to-image models against 2,240 generated images, Anschütz et al. (2024) concluded that none of the systems tested were ready for larger-scale use without human supervision, and Bianchi et al. (2023) showed that the same models silently encode demographic decisions the user never asked for and cannot see. If a sighted researcher cannot yet trust these models' unsupervised output, a BLV user — who cannot glance at the result to catch an error — needs something more reliable underneath the hood, not just a nicer voice reading the same unreliable pixels back to them.

Second, even the current state of the art in conversational image editing has, by its own documentation, not solved dependency-aware layer control. Google's Nano Banana Pro (Gemini 3 Pro Image) explicitly markets itself as editing "without masks, without layers, just natural language," and its own model card cautions that when "generating infographics, annotating diagrams, or representing complex data, it may misinterpret information or produce factually incorrect results," recommending that outputs always be verified (Google DeepMind, 2025). Research systems point the same way: LayerCraft uses an LLM agent to produce a "dependency-aware 3D scene graph" so that objects can be integrated into a scene without disturbing the rest of it (Zhang et al., 2025), and Qwen-Image-Layered pursues RGBA layer decomposition for "inherent editability": but both operate on general photographic scenes, with no accessibility framing, no audio description, and no notion of a node-edge diagram's dependency semantics (an edge that stops existing the moment either of its two endpoints is deleted, in a way that a floating decorative object in a photograph does not).

Third, and most practically for a two-person, one-month team: a graph-first pipeline gives us the accessible layer boundaries and the dependency structure for free, as a direct consequence of the representation, rather than as something we would need a segmentation model to reconstruct after the fact from pixels. A node is a JSON object; an edge is a JSON object that references two node IDs and therefore cannot silently outlive them; a layer is simply "all elements of one type," already grouped.

### 3. System Flow

Two loops that constitute our two research mechanisms: the **decision-confirmation loop** (top) and the **dependency-aware edit loop** (bottom).

**Decision-confirmation loop:**

```
User speaks or types a diagram request
  (e.g., "a web app with a cache in front of the database")
        │
        ▼
Reasoning model parses the prompt
        │
        ▼
Enumerate latent interpretive decisions:
  implied component types, cardinality, edge directionality,
  protocols/labels, grouping, layout hierarchy
        │
        ▼
HCXAI confirmation dialogue:
  present one decision cluster at a time,
  in plain language, with alternatives  ──user contests or corrects──┐
        │                                                            │
        │ user confirms                                              │
        ▼                                                            │
Lock confirmed decisions ◄──────────────────────────────────────────┘
        │
        ▼
Compile structured diagram graph:
  nodes / edges / labels / groups + explicit dependency links
        │
        ▼
Deterministic layout engine (Graphviz / elkjs)
        │
        ▼
Render layered SVG: one accessible group per semantic layer
        │
        ▼
Generate per-layer audio description
        │
        ▼
User reviews the diagram via screen reader / TTS
        │
        ▼
Export final diagram (SVG, tactile-ready, or raster)
```

**Dependency-aware edit loop:**

```
User issues an edit request on a specific layer or element
        │
        ▼
Dependency-reasoning subroutine:
  propose the direct change + enumerate downstream affected elements
        │
        ▼
HCXAI confirmation dialogue for the propagated changes  ──user contests──┐
        │                                                                 │
        │ user confirms                                                  │
        ▼                                                                 │
Apply graph diff ◄────────────────────────────────────────────────────────┘
        │
        ▼
Re-layout only the affected subgraph (unaffected nodes stay put)
        │
        ▼
Re-render only the changed layers
```

Two properties of this flow are the actual research contribution and deserve to be named outside the diagram, not just inside it. The confirmation loop (enumerate → dialogue → confirm/contest → back to dialogue if contested) never lets an interpretive decision reach the rendered diagram without being either confirmed or corrected — it is the mechanism, not a feature bolted onto one. The edit loop (request → propose → confirm → diff → re-layout → re-render) never regenerates the whole diagram from scratch on an edit; it computes a diff, confirms only the consequences of that diff, and re-renders only what changed — which is the entire answer to "how do you modify part of an image without changing the rest of it."

### 4. Model and Tooling Choices

The contribution we are testing is an interaction and representation design, not a new model; fine-tuning would burn a disproportionate share of a four-week, two-person budget on infrastructure rather than on the two mechanisms we actually need to validate.

| Component | Candidate(s) | Why |
|---|---|---|
| Reasoning / decision-enumeration / dependency-reasoning engine | Claude Sonnet 5 or Claude Opus 4.8 with extended thinking; OpenAI GPT-5.4 Thinking or GPT-5.5; Google Gemini 3.1 Pro or Gemini 3 Flash | All three families currently offer a "thinking"/reasoning mode with configurable effort, native structured/JSON output, and function calling — the three requirements for reliably emitting a decision list and a graph diff as parseable objects rather than prose. Pick whichever team already has stable API access and budget for. |
| Structured diagram representation | Custom JSON schema: `nodes[]`, `edges[]`, `labels[]`, `groups[]`, `decisions[]`, `dependencies[]` | A lightweight DSL in the spirit of Graphviz DOT or Mermaid, but decision- and dependency-annotated so that every edge and label can be traced back to the interpretive decision and the node(s) that produced it. |
| Deterministic layout | Graphviz (dot/neato) or elkjs/dagre (JavaScript) | elkjs/dagre run client-side in the browser and expose incremental layout, which we need for "re-layout only the affected subgraph"; Graphviz is more mature for hierarchical node-edge layouts if a server-side step is acceptable. Either is a safe month-one choice; we recommend elkjs if the frontend is React/JS-native, to avoid a server round-trip on every edit. |
| Rendering | SVG, generated so that each semantic layer is its own `<g role="img" aria-label="...">` group | This is what makes "layers" real rather than metaphorical: toggling, describing, or re-rendering a layer is a DOM operation on one group, not a pixel-level guess. |
| Optional stylization pass (explicitly out of month-one core scope) | Nano Banana Pro / Gemini 3 Pro Image, applied only after the structural graph and layout are locked, to skin nodes with icons or a visual theme | Flagged as future work, not a month-one dependency: this is exactly the class of model whose own documentation admits it does not yet offer reliable masks/layers for diagrams (Google DeepMind, 2025), so it must never be allowed to touch topology or layout — only surface style, after our structural pipeline has already fixed everything that matters. |
| Text-to-speech / speech-to-text | Web Speech API for the month-one prototype (free, browser-native, fast to wire up); ElevenLabs or a cloud provider's TTS as a fallback if voice quality or STT accuracy proves inadequate in the formative sessions | We do not want speech-recognition accuracy to be the thing that breaks a pilot session; Week 1's formative sessions include an explicit check on this (Section 6). |
| Accessible frontend | A single-page app (React, or plain HTML/JS if that removes setup overhead) with ARIA live regions for the confirmation dialogue and layer descriptions, fully keyboard-operable | Tested against NVDA and VoiceOver, the two screen readers most represented in the BLV creative-tool literature we reviewed (Lee et al., 2024; Raman, 2025), before any participant touches it. |
| Domain vocabulary (month-one scope constraint) | A fixed set of ~6–8 architecture primitives (client, server, database, load balancer, cache, queue, API gateway, external service) and ~4 edge/protocol types (HTTP, gRPC, SQL, pub/sub) | Keeps the decision taxonomy and the dependency rules tractable for a four-week build; generalizing the vocabulary is future work, not a month-one requirement. |

#### 4.1 A note on the decision-list and dependency schemas

Two small JSON shapes carry the whole design:

```json
// A single interpretive decision, surfaced for confirmation
{
  "decision_id": "d_003",
  "category": "edge_directionality",
  "prompt_span": "a cache in front of the database",
  "description": "I read this as one-directional: API calls the cache, and the cache calls the database only on a miss.",
  "options": ["one-directional (assumed)", "bidirectional", "cache is read-through only"],
  "affects": ["edge_e2"]
}

// A dependency edge in the graph, making downstream effects explicit
{
  "dependency_id": "dep_007",
  "trigger": "node_deleted:n_cache",
  "effect": "delete edges e2, e3; relabel node n_api's outgoing edge to n_db as direct"
}
```

Every edit request is resolved by (1) computing the direct change, (2) walking `dependencies[]` to find everything the change touches, (3) rendering that as a fresh, small decision list for confirmation, and (4) only then applying the diff. This is the same confirmation mechanism used for initial generation, applied a second time to edits.

We measure (for study): (1) **diagram-intent match** — whether the final diagram matches a pre-specified gold intent, coded by the researchers; (2) **correction rounds** — how many confirm/contest cycles it took to reach a diagram the participant was satisfied with; (3) **spatial stability** — how many *unrelated* nodes moved position after an edit, directly testing the "modify one part without disturbing the rest" claim; (4) a short usability measure (SUS or an abbreviated NASA-TLX); and (5) qualitative probes drawn from HCXAI's own evaluative concerns — did the participant feel they understood why the system made a given choice, did they feel able to contest it, and did they trust the final result (Ehsan & Riedl, 2020). This mirrors the comparative, small-n design GenAssist and AltCanvas themselves used to first establish feasibility before scaling up (Huh et al., 2023; Lee et al., 2024), and we cite that precedent deliberately: it is the appropriate rigor for a month-one pilot, not a shortfall from it.
