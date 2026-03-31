/* ============================================
   SPRITER V2 – 2D Rigging & Animation Editor
   Three.js viewport, bone system, timeline, export
   ============================================ */

import * as THREE from 'three';

(function () {
  'use strict';

  // ── Helpers ──
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const DEG = Math.PI / 180;
  const RAD = 180 / Math.PI;
  let nextBoneId = 1;

  // ── State ──
  const state = {
    // Image
    imageLoaded: false,
    imageTexture: null,
    imageWidth: 0,
    imageHeight: 0,
    imageMesh: null,

    // Bones
    bones: [],        // { id, name, x, y, length, rotation, parentId, color }
    selectedBoneId: null,

    // Deformation mode
    deformMode: 'rigid', // 'rigid' | 'mesh'

    // Tools
    activeTool: 'select', // 'select' | 'move' | 'rotate' | 'addBone'

    // Timeline
    timeline: {
      currentTime: 0,
      duration: 5,
      fps: 24,
      isPlaying: false,
      animFrameId: null,
      lastTimestamp: 0,
    },

    // Keyframes: { boneId: [ { time, rotation, x, y } ] }
    keyframes: {},

    // Capture
    capturedFrames: [],

    // Interaction
    isDragging: false,
    dragTarget: null,   // { type: 'bone'|'joint', boneId }
    dragStart: { x: 0, y: 0 },
    lastMouse: { x: 0, y: 0 },

    // Three.js
    scene: null,
    camera: null,
    renderer: null,
    boneGroup: null,
    zoom: 1,
  };

  // ── DOM refs ──
  const dom = {
    viewportCanvas: $('#viewport-canvas'),
    uploadOverlay: $('#upload-overlay'),
    inputImage: $('#input-image'),
    btnUploadImage: $('#btn-upload-image'),

    // Tools
    toolSelect: $('#tool-select'),
    toolMove: $('#tool-move'),
    toolRotate: $('#tool-rotate'),
    toolAddBone: $('#tool-add-bone'),
    toolZoomIn: $('#tool-zoom-in'),
    toolZoomOut: $('#tool-zoom-out'),
    toolZoomFit: $('#tool-zoom-fit'),

    // Mode
    modeRigid: $('#mode-rigid'),
    modeMesh: $('#mode-mesh'),
    modeDescription: $('#mode-description'),

    // Skeleton
    btnAddBone: $('#btn-add-bone'),
    btnDeleteBone: $('#btn-delete-bone'),
    boneList: $('#bone-list'),
    boneCountBadge: $('#bone-count-badge'),

    // Properties
    boneProperties: $('#bone-properties'),
    propBoneName: $('#prop-bone-name'),
    propBoneRotation: $('#prop-bone-rotation'),
    sliderBoneRotation: $('#slider-bone-rotation'),
    propBoneLength: $('#prop-bone-length'),
    propBoneParent: $('#prop-bone-parent'),

    // Export settings
    exportWidth: $('#export-width'),
    exportHeight: $('#export-height'),
    exportFps: $('#export-fps'),

    // Timeline
    tlPlay: $('#tl-play'),
    tlPause: $('#tl-pause'),
    tlStop: $('#tl-stop'),
    tlTimeDisplay: $('#tl-time-display'),
    tlFrameDisplay: $('#tl-frame-display'),
    tlDuration: $('#tl-duration'),
    btnAddKeyframe: $('#btn-add-keyframe'),
    btnDeleteKeyframe: $('#btn-delete-keyframe'),
    timelineRuler: $('#timeline-ruler'),
    timelineRulerArea: $('#timeline-ruler-area'),
    playhead: $('#playhead'),
    timelineTracks: $('#timeline-tracks'),
    timelineTrackLabels: $('#timeline-track-labels'),

    // Export
    btnCaptureFrame: $('#btn-capture-frame'),
    btnExportGif: $('#btn-export-gif'),
    btnExportWebm: $('#btn-export-webm'),
    capturedFramesPanel: $('#captured-frames-panel'),
    capturedStrip: $('#captured-strip'),
    capturedCount: $('#captured-count'),
    btnClearCaptured: $('#btn-clear-captured'),
    exportProgress: $('#export-progress'),
    exportProgressFill: $('#export-progress-fill'),
    exportProgressText: $('#export-progress-text'),
  };

  // ═══════════════════════════════════════
  //  THREE.JS SETUP
  // ═══════════════════════════════════════
  function initThreeJS() {
    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0x0e1018);

    // Orthographic camera for 2D
    const aspect = dom.viewportCanvas.clientWidth / dom.viewportCanvas.clientHeight;
    const frustum = 400;
    state.camera = new THREE.OrthographicCamera(
      -frustum * aspect, frustum * aspect,
      frustum, -frustum,
      0.1, 1000
    );
    state.camera.position.set(0, 0, 500);
    state.camera.lookAt(0, 0, 0);

    state.renderer = new THREE.WebGLRenderer({
      canvas: dom.viewportCanvas,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    state.renderer.setSize(dom.viewportCanvas.clientWidth, dom.viewportCanvas.clientHeight);
    state.renderer.setPixelRatio(window.devicePixelRatio);

    // Grid
    addGrid();

    // Bone overlay group
    state.boneGroup = new THREE.Group();
    state.boneGroup.position.z = 10;
    state.scene.add(state.boneGroup);

    // Handle resize
    window.addEventListener('resize', onResize);

    // Start render loop
    render();
  }

  function addGrid() {
    const gridSize = 1000;
    const gridDivisions = 40;
    const gridColor1 = new THREE.Color(0x1a1d2a);
    const gridColor2 = new THREE.Color(0x15171f);
    const grid = new THREE.GridHelper(gridSize, gridDivisions, gridColor1, gridColor2);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -1;
    state.scene.add(grid);
  }

  function onResize() {
    const w = dom.viewportCanvas.clientWidth;
    const h = dom.viewportCanvas.clientHeight;
    if (w === 0 || h === 0) return;

    const aspect = w / h;
    const frustum = 400 / state.zoom;
    state.camera.left = -frustum * aspect;
    state.camera.right = frustum * aspect;
    state.camera.top = frustum;
    state.camera.bottom = -frustum;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(w, h);
  }

  function updateCamera() {
    const w = dom.viewportCanvas.clientWidth;
    const h = dom.viewportCanvas.clientHeight;
    if (w === 0 || h === 0) return;
    const aspect = w / h;
    const frustum = 400 / state.zoom;
    state.camera.left = -frustum * aspect;
    state.camera.right = frustum * aspect;
    state.camera.top = frustum;
    state.camera.bottom = -frustum;
    state.camera.updateProjectionMatrix();
  }

  function render() {
    requestAnimationFrame(render);
    state.renderer.render(state.scene, state.camera);
  }

  // ═══════════════════════════════════════
  //  IMAGE UPLOAD
  // ═══════════════════════════════════════
  function initUpload() {
    dom.btnUploadImage.addEventListener('click', (e) => {
      e.stopPropagation();
      dom.inputImage.click();
    });

    dom.inputImage.addEventListener('change', (e) => {
      if (e.target.files.length) loadImage(e.target.files[0]);
    });

    // Drag & Drop on the overlay
    dom.uploadOverlay.addEventListener('dragover', (e) => {
      e.preventDefault();
      dom.uploadOverlay.classList.add('drag-over');
    });
    dom.uploadOverlay.addEventListener('dragleave', () => {
      dom.uploadOverlay.classList.remove('drag-over');
    });
    dom.uploadOverlay.addEventListener('drop', (e) => {
      e.preventDefault();
      dom.uploadOverlay.classList.remove('drag-over');
      const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'));
      if (file) loadImage(file);
    });

    // Also allow drop on viewport when image already loaded
    dom.viewportCanvas.addEventListener('dragover', (e) => e.preventDefault());
    dom.viewportCanvas.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/'));
      if (file) loadImage(file);
    });
  }

  function loadImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        state.imageWidth = img.naturalWidth;
        state.imageHeight = img.naturalHeight;

        // Update export resolution
        dom.exportWidth.value = img.naturalWidth;
        dom.exportHeight.value = img.naturalHeight;

        // Create Three.js texture
        const texture = new THREE.Texture(img);
        texture.needsUpdate = true;
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        state.imageTexture = texture;

        // Remove old mesh & mesh deform data if any
        if (state.imageMesh) {
          state.scene.remove(state.imageMesh);
          state.imageMesh.geometry.dispose();
          state.imageMesh.material.dispose();
        }

        createImageMesh();

        state.imageLoaded = true;
        dom.uploadOverlay.classList.add('hidden');

        // Zoom to fit
        zoomFit();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function createImageMesh() {
    if (state.deformMode === 'mesh') {
      createMeshDeformPlane();
    } else {
      createRigidPlane();
    }
  }

  function createRigidPlane() {
    const geometry = new THREE.PlaneGeometry(state.imageWidth, state.imageHeight);
    const material = new THREE.MeshBasicMaterial({
      map: state.imageTexture,
      transparent: true,
      side: THREE.DoubleSide,
    });
    state.imageMesh = new THREE.Mesh(geometry, material);
    state.imageMesh.position.z = 0;
    state.scene.add(state.imageMesh);
  }

  function createMeshDeformPlane() {
    // Subdivided plane for mesh deformation
    const segW = Math.max(2, Math.ceil(state.imageWidth / 20));
    const segH = Math.max(2, Math.ceil(state.imageHeight / 20));
    const geometry = new THREE.PlaneGeometry(state.imageWidth, state.imageHeight, segW, segH);
    const material = new THREE.MeshBasicMaterial({
      map: state.imageTexture,
      transparent: true,
      side: THREE.DoubleSide,
    });
    state.imageMesh = new THREE.Mesh(geometry, material);
    state.imageMesh.position.z = 0;

    // Store original vertex positions for deformation reference
    const pos = geometry.attributes.position;
    state.imageMesh.userData.originalPositions = new Float32Array(pos.array);
    state.imageMesh.userData.segW = segW;
    state.imageMesh.userData.segH = segH;

    state.scene.add(state.imageMesh);
  }

  // ═══════════════════════════════════════
  //  BONE / SKELETON SYSTEM
  // ═══════════════════════════════════════
  const BONE_COLORS = [
    '#a78bfa', '#f472b6', '#34d399', '#60a5fa',
    '#fbbf24', '#f87171', '#c084fc', '#22d3ee',
  ];

  function createBone(parentId = null, x = 0, y = 0, length = 60, rotation = 0) {
    const id = nextBoneId++;
    const colorIdx = (state.bones.length) % BONE_COLORS.length;
    const bone = {
      id,
      name: `Bone ${id}`,
      x, y,
      length,
      rotation,
      parentId,
      color: BONE_COLORS[colorIdx],
    };
    state.bones.push(bone);
    state.keyframes[id] = [];

    renderBoneOverlay();
    renderBoneList();
    renderTimelineTracks();
    selectBone(id);
    return bone;
  }

  function deleteBone(boneId) {
    // Also delete children
    const children = state.bones.filter(b => b.parentId === boneId);
    children.forEach(c => deleteBone(c.id));

    state.bones = state.bones.filter(b => b.id !== boneId);
    delete state.keyframes[boneId];

    if (state.selectedBoneId === boneId) {
      state.selectedBoneId = null;
      dom.boneProperties.style.display = 'none';
    }

    renderBoneOverlay();
    renderBoneList();
    renderTimelineTracks();
  }

  function selectBone(boneId) {
    state.selectedBoneId = boneId;
    const bone = state.bones.find(b => b.id === boneId);
    if (!bone) {
      dom.boneProperties.style.display = 'none';
      dom.btnDeleteBone.disabled = true;
      renderBoneList();
      renderBoneOverlay();
      return;
    }

    dom.boneProperties.style.display = '';
    dom.btnDeleteBone.disabled = false;

    dom.propBoneName.value = bone.name;
    dom.propBoneRotation.value = Math.round(bone.rotation);
    dom.sliderBoneRotation.value = Math.round(bone.rotation);
    dom.propBoneLength.value = Math.round(bone.length);

    // Populate parent select
    dom.propBoneParent.innerHTML = '<option value="">Ninguno (Root)</option>';
    state.bones.forEach(b => {
      if (b.id === boneId) return;
      // Prevent circular parenting
      if (isDescendant(b.id, boneId)) return;
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.name;
      if (b.id === bone.parentId) opt.selected = true;
      dom.propBoneParent.appendChild(opt);
    });

    renderBoneList();
    renderBoneOverlay();
  }

  function isDescendant(boneId, ancestorId) {
    const bone = state.bones.find(b => b.id === boneId);
    if (!bone || !bone.parentId) return false;
    if (bone.parentId === ancestorId) return true;
    return isDescendant(bone.parentId, ancestorId);
  }

  function getBoneWorldTransform(bone) {
    // Get cumulative position and rotation from root → bone
    let totalRotation = 0;
    let worldX = 0;
    let worldY = 0;

    const chain = [];
    let current = bone;
    while (current) {
      chain.unshift(current);
      current = state.bones.find(b => b.id === current.parentId);
    }

    for (const b of chain) {
      if (b === chain[0] && !b.parentId) {
        // Root bone: absolute position
        worldX = b.x;
        worldY = b.y;
        totalRotation = b.rotation;
      } else {
        // Child bone: relative to parent's end
        totalRotation += b.rotation;
        worldX += b.x;
        worldY += b.y;
      }
    }

    return { x: worldX, y: worldY, rotation: totalRotation };
  }

  function getBoneEndPoint(bone) {
    const wt = getBoneWorldTransform(bone);
    const rad = wt.rotation * DEG;
    return {
      x: wt.x + Math.cos(rad) * bone.length,
      y: wt.y + Math.sin(rad) * bone.length,
    };
  }

  // ── Bone Overlay Rendering (Three.js lines + circles) ──
  function renderBoneOverlay() {
    // Clear existing
    while (state.boneGroup.children.length > 0) {
      const child = state.boneGroup.children[0];
      state.boneGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }

    state.bones.forEach(bone => {
      const wt = getBoneWorldTransform(bone);
      const end = getBoneEndPoint(bone);
      const isSelected = bone.id === state.selectedBoneId;

      const color = new THREE.Color(bone.color);
      const lineWidth = isSelected ? 3 : 2;

      // Bone line
      const lineMat = new THREE.LineBasicMaterial({
        color: color,
        linewidth: lineWidth,
        transparent: true,
        opacity: isSelected ? 1.0 : 0.7,
      });
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(wt.x, wt.y, 0),
        new THREE.Vector3(end.x, end.y, 0),
      ]);
      const line = new THREE.Line(lineGeo, lineMat);
      line.userData.boneId = bone.id;
      state.boneGroup.add(line);

      // Joint circle at start
      const jointGeo = new THREE.CircleGeometry(isSelected ? 6 : 4, 16);
      const jointMat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: isSelected ? 1.0 : 0.8,
      });
      const joint = new THREE.Mesh(jointGeo, jointMat);
      joint.position.set(wt.x, wt.y, 1);
      joint.userData.boneId = bone.id;
      joint.userData.jointType = 'start';
      state.boneGroup.add(joint);

      // Joint circle at end
      const endGeo = new THREE.CircleGeometry(isSelected ? 5 : 3, 16);
      const endMat = new THREE.MeshBasicMaterial({
        color: isSelected ? new THREE.Color('#ffffff') : color,
        transparent: true,
        opacity: isSelected ? 0.9 : 0.6,
      });
      const endJoint = new THREE.Mesh(endGeo, endMat);
      endJoint.position.set(end.x, end.y, 1);
      endJoint.userData.boneId = bone.id;
      endJoint.userData.jointType = 'end';
      state.boneGroup.add(endJoint);

      // Selection glow ring
      if (isSelected) {
        const glowGeo = new THREE.RingGeometry(7, 10, 24);
        const glowMat = new THREE.MeshBasicMaterial({
          color: color,
          transparent: true,
          opacity: 0.3,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.position.set(wt.x, wt.y, 2);
        state.boneGroup.add(glow);
      }
    });

    dom.boneCountBadge.textContent = state.bones.length;
  }

  // ── Bone List in Panel ──
  function renderBoneList() {
    dom.boneList.innerHTML = '';
    if (state.bones.length === 0) {
      dom.boneList.innerHTML = '<p class="placeholder-text">Sin huesos. Usa "Agregar Hueso" para comenzar.</p>';
      return;
    }

    // Build hierarchy
    const roots = state.bones.filter(b => !b.parentId);
    roots.forEach(b => renderBoneListItem(b, 0));
  }

  function renderBoneListItem(bone, depth) {
    const item = document.createElement('div');
    item.className = `bone-item${depth > 0 ? ` indent-${Math.min(depth, 3)}` : ''}${bone.id === state.selectedBoneId ? ' selected' : ''}`;
    item.dataset.boneId = bone.id;
    item.innerHTML = `
      <span class="bone-icon" style="color:${bone.color}">🦴</span>
      <span class="bone-name">${bone.name}</span>
    `;
    item.addEventListener('click', () => selectBone(bone.id));
    dom.boneList.appendChild(item);

    // Render children
    const children = state.bones.filter(b => b.parentId === bone.id);
    children.forEach(c => renderBoneListItem(c, depth + 1));
  }

  // ═══════════════════════════════════════
  //  MESH DEFORMATION
  // ═══════════════════════════════════════
  function applyMeshDeformation() {
    if (state.deformMode !== 'mesh' || !state.imageMesh || !state.imageMesh.userData.originalPositions) return;

    const geometry = state.imageMesh.geometry;
    const positions = geometry.attributes.position;
    const original = state.imageMesh.userData.originalPositions;

    for (let i = 0; i < positions.count; i++) {
      const ox = original[i * 3];
      const oy = original[i * 3 + 1];

      let newX = ox;
      let newY = oy;

      // Find bone influence
      let totalWeight = 0;
      let deltaX = 0;
      let deltaY = 0;

      state.bones.forEach(bone => {
        const wt = getBoneWorldTransform(bone);
        const end = getBoneEndPoint(bone);

        // Distance from vertex to bone line
        const dist = pointToSegmentDist(ox, oy, wt.x, wt.y, end.x, end.y);
        const influence = Math.max(0, 1 - dist / (bone.length * 1.5));

        if (influence > 0) {
          const rad = wt.rotation * DEG;
          // Simple rotation-based deformation around bone start
          const rx = ox - wt.x;
          const ry = oy - wt.y;
          const cr = Math.cos(rad);
          const sr = Math.sin(rad);

          // Only deform, not the resting position
          const restRad = 0; // Initial rotation is 0
          const restCr = Math.cos(restRad);
          const restSr = Math.sin(restRad);

          const rotatedX = wt.x + rx * cr - ry * sr;
          const rotatedY = wt.y + rx * sr + ry * cr;

          deltaX += (rotatedX - ox) * influence;
          deltaY += (rotatedY - oy) * influence;
          totalWeight += influence;
        }
      });

      if (totalWeight > 0) {
        newX = ox + deltaX / totalWeight;
        newY = oy + deltaY / totalWeight;
      }

      positions.setXY(i, newX, newY);
    }

    positions.needsUpdate = true;
  }

  function pointToSegmentDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
  }

  // ═══════════════════════════════════════
  //  VIEWPORT INTERACTION
  // ═══════════════════════════════════════
  function initViewportEvents() {
    const canvas = dom.viewportCanvas;

    canvas.addEventListener('mousedown', onViewportMouseDown);
    canvas.addEventListener('mousemove', onViewportMouseMove);
    canvas.addEventListener('mouseup', onViewportMouseUp);
    canvas.addEventListener('wheel', onViewportWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function screenToWorld(clientX, clientY) {
    const rect = dom.viewportCanvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;

    const worldX = ndcX * (state.camera.right - state.camera.left) / 2 + (state.camera.right + state.camera.left) / 2;
    const worldY = ndcY * (state.camera.top - state.camera.bottom) / 2 + (state.camera.top + state.camera.bottom) / 2;

    return { x: worldX, y: worldY };
  }

  function findBoneNearPoint(wx, wy, threshold = 15) {
    let closest = null;
    let closestDist = threshold / state.zoom;

    state.bones.forEach(bone => {
      const wt = getBoneWorldTransform(bone);
      const end = getBoneEndPoint(bone);

      // Check joints
      const dStart = Math.sqrt((wx - wt.x) ** 2 + (wy - wt.y) ** 2);
      const dEnd = Math.sqrt((wx - end.x) ** 2 + (wy - end.y) ** 2);

      if (dStart < closestDist) {
        closestDist = dStart;
        closest = { boneId: bone.id, type: 'start' };
      }
      if (dEnd < closestDist) {
        closestDist = dEnd;
        closest = { boneId: bone.id, type: 'end' };
      }

      // Check bone line
      const dLine = pointToSegmentDist(wx, wy, wt.x, wt.y, end.x, end.y);
      if (dLine < closestDist * 0.8) {
        closestDist = dLine;
        closest = { boneId: bone.id, type: 'line' };
      }
    });

    return closest;
  }

  function onViewportMouseDown(e) {
    if (e.button !== 0) return;

    const { x: wx, y: wy } = screenToWorld(e.clientX, e.clientY);

    if (state.activeTool === 'addBone') {
      // Add bone at click position
      const parentId = state.selectedBoneId || null;
      const parent = state.bones.find(b => b.id === parentId);

      let bx = wx, by = wy;
      if (parent) {
        // Place at parent end
        const pEnd = getBoneEndPoint(parent);
        bx = pEnd.x;
        by = pEnd.y;
      }
      createBone(parentId, bx, by, 60, 0);
      setTool('select');
      return;
    }

    // Try to find a bone near click
    const hit = findBoneNearPoint(wx, wy);
    if (hit) {
      selectBone(hit.boneId);
      state.isDragging = true;
      state.dragTarget = hit;
      state.dragStart = { x: wx, y: wy };
      state.lastMouse = { x: wx, y: wy };
      dom.viewportCanvas.style.cursor = 'grabbing';
    } else {
      // Deselect
      state.selectedBoneId = null;
      dom.boneProperties.style.display = 'none';
      dom.btnDeleteBone.disabled = true;
      renderBoneList();
      renderBoneOverlay();
    }
  }

  function onViewportMouseMove(e) {
    const { x: wx, y: wy } = screenToWorld(e.clientX, e.clientY);

    if (state.isDragging && state.dragTarget) {
      const bone = state.bones.find(b => b.id === state.dragTarget.boneId);
      if (!bone) return;

      const dx = wx - state.lastMouse.x;
      const dy = wy - state.lastMouse.y;

      if (state.activeTool === 'rotate' || state.dragTarget.type === 'end') {
        // Rotate bone
        const wt = getBoneWorldTransform(bone);
        const angle = Math.atan2(wy - wt.y, wx - wt.x) * RAD;

        // Subtract parent's world rotation to get local rotation
        const parent = state.bones.find(b => b.id === bone.parentId);
        let parentWorldRot = 0;
        if (parent) {
          const pwt = getBoneWorldTransform(parent);
          parentWorldRot = pwt.rotation;
        }

        bone.rotation = angle - parentWorldRot;
        updateBoneProperties();
      } else {
        // Move bone
        bone.x += dx;
        bone.y += dy;
      }

      renderBoneOverlay();
      if (state.deformMode === 'mesh') applyMeshDeformation();

      state.lastMouse = { x: wx, y: wy };
    } else {
      // Hover cursor
      const hit = findBoneNearPoint(wx, wy);
      dom.viewportCanvas.style.cursor = hit ? 'pointer' : 'default';
    }
  }

  function onViewportMouseUp() {
    if (state.isDragging) {
      state.isDragging = false;
      state.dragTarget = null;
      dom.viewportCanvas.style.cursor = 'default';
    }
  }

  function onViewportWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    state.zoom = Math.max(0.1, Math.min(10, state.zoom * delta));
    updateCamera();
  }

  // ═══════════════════════════════════════
  //  TOOLS
  // ═══════════════════════════════════════
  function initTools() {
    const toolButtons = {
      select: dom.toolSelect,
      move: dom.toolMove,
      rotate: dom.toolRotate,
      addBone: dom.toolAddBone,
    };

    Object.entries(toolButtons).forEach(([tool, btn]) => {
      btn.addEventListener('click', () => setTool(tool));
    });

    dom.toolZoomIn.addEventListener('click', () => { state.zoom = Math.min(10, state.zoom * 1.3); updateCamera(); });
    dom.toolZoomOut.addEventListener('click', () => { state.zoom = Math.max(0.1, state.zoom / 1.3); updateCamera(); });
    dom.toolZoomFit.addEventListener('click', zoomFit);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      switch (e.key.toLowerCase()) {
        case 'v': setTool('select'); break;
        case 'g': setTool('move'); break;
        case 'r': setTool('rotate'); break;
        case 'b': setTool('addBone'); break;
        case 'delete': case 'backspace':
          if (state.selectedBoneId) deleteBone(state.selectedBoneId);
          break;
      }
    });
  }

  function setTool(tool) {
    state.activeTool = tool;
    $$('.tool-btn').forEach(b => b.classList.remove('active'));
    const btn = {
      select: dom.toolSelect,
      move: dom.toolMove,
      rotate: dom.toolRotate,
      addBone: dom.toolAddBone,
    }[tool];
    if (btn) btn.classList.add('active');

    dom.viewportCanvas.style.cursor = tool === 'addBone' ? 'crosshair' : 'default';
  }

  function zoomFit() {
    if (!state.imageLoaded) return;
    const canvasW = dom.viewportCanvas.clientWidth;
    const canvasH = dom.viewportCanvas.clientHeight;
    const scaleX = (canvasW * 0.8) / state.imageWidth;
    const scaleY = (canvasH * 0.8) / state.imageHeight;
    state.zoom = Math.min(scaleX, scaleY) * (400 / Math.max(state.imageWidth, state.imageHeight)) * 2;
    state.zoom = Math.max(0.1, Math.min(10, state.zoom));
    updateCamera();
  }

  // ═══════════════════════════════════════
  //  PANEL EVENTS
  // ═══════════════════════════════════════
  function initPanelEvents() {
    // Mode toggle
    dom.modeRigid.addEventListener('click', () => switchMode('rigid'));
    dom.modeMesh.addEventListener('click', () => switchMode('mesh'));

    // Add/Delete bone
    dom.btnAddBone.addEventListener('click', () => {
      if (!state.imageLoaded) return;
      setTool('addBone');
    });
    dom.btnDeleteBone.addEventListener('click', () => {
      if (state.selectedBoneId) deleteBone(state.selectedBoneId);
    });

    // Bone properties
    dom.propBoneName.addEventListener('input', () => {
      const bone = state.bones.find(b => b.id === state.selectedBoneId);
      if (bone) { bone.name = dom.propBoneName.value; renderBoneList(); renderTimelineTracks(); }
    });

    dom.propBoneRotation.addEventListener('input', () => {
      const bone = state.bones.find(b => b.id === state.selectedBoneId);
      if (bone) {
        bone.rotation = parseFloat(dom.propBoneRotation.value) || 0;
        dom.sliderBoneRotation.value = bone.rotation;
        renderBoneOverlay();
        if (state.deformMode === 'mesh') applyMeshDeformation();
      }
    });

    dom.sliderBoneRotation.addEventListener('input', () => {
      dom.propBoneRotation.value = dom.sliderBoneRotation.value;
      const bone = state.bones.find(b => b.id === state.selectedBoneId);
      if (bone) {
        bone.rotation = parseFloat(dom.sliderBoneRotation.value) || 0;
        renderBoneOverlay();
        if (state.deformMode === 'mesh') applyMeshDeformation();
      }
    });

    dom.propBoneLength.addEventListener('input', () => {
      const bone = state.bones.find(b => b.id === state.selectedBoneId);
      if (bone) {
        bone.length = Math.max(5, parseFloat(dom.propBoneLength.value) || 50);
        renderBoneOverlay();
      }
    });

    dom.propBoneParent.addEventListener('change', () => {
      const bone = state.bones.find(b => b.id === state.selectedBoneId);
      if (bone) {
        bone.parentId = dom.propBoneParent.value ? parseInt(dom.propBoneParent.value) : null;
        renderBoneOverlay();
        renderBoneList();
      }
    });
  }

  function switchMode(mode) {
    state.deformMode = mode;
    dom.modeRigid.classList.toggle('active', mode === 'rigid');
    dom.modeMesh.classList.toggle('active', mode === 'mesh');
    dom.modeDescription.textContent = mode === 'rigid'
      ? 'Transformación rígida: cada sección se mueve como un bloque con su hueso.'
      : 'Deformación de mesh: la imagen se deforma suavemente según los huesos.';

    // Recreate image mesh
    if (state.imageLoaded && state.imageTexture) {
      if (state.imageMesh) {
        state.scene.remove(state.imageMesh);
        state.imageMesh.geometry.dispose();
        state.imageMesh.material.dispose();
      }
      createImageMesh();
      if (mode === 'mesh') applyMeshDeformation();
    }
  }

  function updateBoneProperties() {
    const bone = state.bones.find(b => b.id === state.selectedBoneId);
    if (!bone) return;
    dom.propBoneRotation.value = Math.round(bone.rotation);
    dom.sliderBoneRotation.value = Math.round(bone.rotation);
  }

  // ═══════════════════════════════════════
  //  TIMELINE & KEYFRAMES
  // ═══════════════════════════════════════
  function initTimeline() {
    // Transport
    dom.tlPlay.addEventListener('click', playAnimation);
    dom.tlPause.addEventListener('click', pauseAnimation);
    dom.tlStop.addEventListener('click', stopAnimation);

    // Duration
    dom.tlDuration.addEventListener('input', () => {
      state.timeline.duration = Math.max(0.5, parseFloat(dom.tlDuration.value) || 5);
      renderTimelineRuler();
      renderTimelineTracks();
      updateTimeDisplay();
    });

    // Keyframes
    dom.btnAddKeyframe.addEventListener('click', addKeyframeAtCurrentTime);
    dom.btnDeleteKeyframe.addEventListener('click', deleteKeyframeAtCurrentTime);

    // Playhead drag
    dom.timelineRulerArea.addEventListener('mousedown', onTimelineMouseDown);

    // Initial render
    renderTimelineRuler();
    renderTimelineTracks();
    updateTimeDisplay();
  }

  function addKeyframeAtCurrentTime() {
    if (!state.selectedBoneId) return;
    const bone = state.bones.find(b => b.id === state.selectedBoneId);
    if (!bone) return;

    const time = state.timeline.currentTime;
    let kfs = state.keyframes[bone.id];
    if (!kfs) kfs = state.keyframes[bone.id] = [];

    // Remove existing keyframe at same time
    const existingIdx = kfs.findIndex(k => Math.abs(k.time - time) < 0.01);
    if (existingIdx >= 0) kfs.splice(existingIdx, 1);

    kfs.push({
      time,
      rotation: bone.rotation,
      x: bone.x,
      y: bone.y,
    });

    // Sort by time
    kfs.sort((a, b) => a.time - b.time);

    renderTimelineTracks();
  }

  function deleteKeyframeAtCurrentTime() {
    if (!state.selectedBoneId) return;
    const kfs = state.keyframes[state.selectedBoneId];
    if (!kfs) return;

    const time = state.timeline.currentTime;
    const idx = kfs.findIndex(k => Math.abs(k.time - time) < 0.05);
    if (idx >= 0) {
      kfs.splice(idx, 1);
      renderTimelineTracks();
    }
  }

  function interpolateAtTime(time) {
    state.bones.forEach(bone => {
      const kfs = state.keyframes[bone.id];
      if (!kfs || kfs.length === 0) return;

      if (kfs.length === 1) {
        bone.rotation = kfs[0].rotation;
        bone.x = kfs[0].x;
        bone.y = kfs[0].y;
        return;
      }

      // Find surrounding keyframes
      if (time <= kfs[0].time) {
        bone.rotation = kfs[0].rotation;
        bone.x = kfs[0].x;
        bone.y = kfs[0].y;
        return;
      }

      if (time >= kfs[kfs.length - 1].time) {
        bone.rotation = kfs[kfs.length - 1].rotation;
        bone.x = kfs[kfs.length - 1].x;
        bone.y = kfs[kfs.length - 1].y;
        return;
      }

      // Find two surrounding keyframes
      for (let i = 0; i < kfs.length - 1; i++) {
        if (time >= kfs[i].time && time <= kfs[i + 1].time) {
          const t = (time - kfs[i].time) / (kfs[i + 1].time - kfs[i].time);
          // Smooth interpolation (ease in-out)
          const st = t * t * (3 - 2 * t);

          bone.rotation = kfs[i].rotation + (kfs[i + 1].rotation - kfs[i].rotation) * st;
          bone.x = kfs[i].x + (kfs[i + 1].x - kfs[i].x) * st;
          bone.y = kfs[i].y + (kfs[i + 1].y - kfs[i].y) * st;
          break;
        }
      }
    });

    renderBoneOverlay();
    if (state.deformMode === 'mesh') applyMeshDeformation();
    if (state.selectedBoneId) updateBoneProperties();
  }

  // ── Animation Playback ──
  function playAnimation() {
    if (state.timeline.isPlaying) return;
    state.timeline.isPlaying = true;
    state.timeline.lastTimestamp = performance.now();
    dom.tlPlay.classList.add('hidden');
    dom.tlPause.classList.remove('hidden');
    animationLoop();
  }

  function pauseAnimation() {
    state.timeline.isPlaying = false;
    dom.tlPlay.classList.remove('hidden');
    dom.tlPause.classList.add('hidden');
    if (state.timeline.animFrameId) {
      cancelAnimationFrame(state.timeline.animFrameId);
      state.timeline.animFrameId = null;
    }
  }

  function stopAnimation() {
    pauseAnimation();
    state.timeline.currentTime = 0;
    interpolateAtTime(0);
    updatePlayhead();
    updateTimeDisplay();
  }

  function animationLoop() {
    if (!state.timeline.isPlaying) return;

    const now = performance.now();
    const delta = (now - state.timeline.lastTimestamp) / 1000;
    state.timeline.lastTimestamp = now;

    state.timeline.currentTime += delta;
    if (state.timeline.currentTime > state.timeline.duration) {
      state.timeline.currentTime = 0;
    }

    interpolateAtTime(state.timeline.currentTime);
    updatePlayhead();
    updateTimeDisplay();

    state.timeline.animFrameId = requestAnimationFrame(animationLoop);
  }

  // ── Timeline Rendering ──
  function renderTimelineRuler() {
    const canvas = dom.timelineRuler;
    const rect = dom.timelineRulerArea.getBoundingClientRect();
    canvas.width = rect.width;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const dur = state.timeline.duration;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(12, 14, 20, 0.9)';
    ctx.fillRect(0, 0, w, h);

    // Draw time markers
    ctx.fillStyle = '#555a6e';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';

    const step = dur <= 3 ? 0.5 : dur <= 10 ? 1 : 2;
    for (let t = 0; t <= dur; t += step) {
      const x = (t / dur) * w;
      ctx.fillStyle = '#555a6e';
      ctx.fillRect(x, h - 8, 1, 8);
      ctx.fillStyle = '#8b90a0';
      ctx.fillText(formatTime(t), x, h - 10);
    }

    // Sub-ticks
    const subStep = step / 4;
    ctx.fillStyle = '#333';
    for (let t = 0; t <= dur; t += subStep) {
      const x = (t / dur) * w;
      ctx.fillRect(x, h - 4, 1, 4);
    }
  }

  function renderTimelineTracks() {
    dom.timelineTracks.innerHTML = '';
    dom.timelineTrackLabels.innerHTML = '';

    const areaWidth = dom.timelineRulerArea.getBoundingClientRect().width;
    const dur = state.timeline.duration;

    state.bones.forEach(bone => {
      // Label
      const label = document.createElement('div');
      label.className = `track-label${bone.id === state.selectedBoneId ? ' selected' : ''}`;
      label.textContent = bone.name;
      label.style.color = bone.color;
      label.addEventListener('click', () => selectBone(bone.id));
      dom.timelineTrackLabels.appendChild(label);

      // Track
      const track = document.createElement('div');
      track.className = 'timeline-track';
      track.dataset.boneId = bone.id;

      // Keyframes
      const kfs = state.keyframes[bone.id] || [];
      kfs.forEach((kf, idx) => {
        const marker = document.createElement('div');
        marker.className = `keyframe-marker${idx === 0 ? ' first' : ''}`;
        marker.style.left = `${(kf.time / dur) * areaWidth}px`;
        marker.title = `${bone.name} @ ${formatTime(kf.time)}`;

        marker.addEventListener('click', (e) => {
          e.stopPropagation();
          state.timeline.currentTime = kf.time;
          selectBone(bone.id);
          interpolateAtTime(kf.time);
          updatePlayhead();
          updateTimeDisplay();
        });

        track.appendChild(marker);
      });

      // Click track to add keyframe
      track.addEventListener('dblclick', (e) => {
        const rect = track.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const time = (x / rect.width) * dur;
        selectBone(bone.id);
        state.timeline.currentTime = time;
        addKeyframeAtCurrentTime();
        updatePlayhead();
        updateTimeDisplay();
      });

      dom.timelineTracks.appendChild(track);
    });
  }

  function updatePlayhead() {
    const areaWidth = dom.timelineRulerArea.getBoundingClientRect().width;
    const x = (state.timeline.currentTime / state.timeline.duration) * areaWidth;
    dom.playhead.style.left = `${x}px`;
  }

  function updateTimeDisplay() {
    const t = state.timeline.currentTime;
    const dur = state.timeline.duration;
    const fps = parseInt(dom.exportFps.value) || 24;
    const frame = Math.floor(t * fps);
    const totalFrames = Math.floor(dur * fps);
    dom.tlTimeDisplay.textContent = `${formatTime(t)} / ${formatTime(dur)}`;
    dom.tlFrameDisplay.textContent = `F: ${frame} / ${totalFrames}`;
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toFixed(1);
    return `${m}:${s.padStart(4, '0')}`;
  }

  function onTimelineMouseDown(e) {
    const rect = dom.timelineRulerArea.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = Math.max(0, Math.min(state.timeline.duration, (x / rect.width) * state.timeline.duration));
    state.timeline.currentTime = time;
    interpolateAtTime(time);
    updatePlayhead();
    updateTimeDisplay();

    const onMove = (e2) => {
      const x2 = e2.clientX - rect.left;
      const t2 = Math.max(0, Math.min(state.timeline.duration, (x2 / rect.width) * state.timeline.duration));
      state.timeline.currentTime = t2;
      interpolateAtTime(t2);
      updatePlayhead();
      updateTimeDisplay();
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ═══════════════════════════════════════
  //  FRAME CAPTURE & EXPORT
  // ═══════════════════════════════════════
  function initExport() {
    dom.btnCaptureFrame.addEventListener('click', captureCurrentFrame);
    dom.btnExportGif.addEventListener('click', exportGif);
    dom.btnExportWebm.addEventListener('click', exportWebM);
    dom.btnClearCaptured.addEventListener('click', clearCaptured);
  }

  function captureCurrentFrame() {
    if (!state.imageLoaded) return;

    const w = parseInt(dom.exportWidth.value) || state.imageWidth;
    const h = parseInt(dom.exportHeight.value) || state.imageHeight;

    // Render at export resolution
    const prevSize = { w: state.renderer.domElement.width, h: state.renderer.domElement.height };
    state.renderer.setSize(w, h);
    state.renderer.render(state.scene, state.camera);

    const dataUrl = state.renderer.domElement.toDataURL('image/png');

    // Restore viewport size
    state.renderer.setSize(dom.viewportCanvas.clientWidth, dom.viewportCanvas.clientHeight);

    state.capturedFrames.push(dataUrl);
    renderCapturedStrip();
  }

  function renderCapturedStrip() {
    dom.capturedFramesPanel.classList.remove('hidden');
    dom.capturedCount.textContent = state.capturedFrames.length;
    dom.capturedStrip.innerHTML = '';

    state.capturedFrames.forEach((dataUrl, i) => {
      const card = document.createElement('div');
      card.className = 'frame-card';
      card.innerHTML = `
        <img class="frame-thumb" src="${dataUrl}" alt="Frame ${i + 1}">
        <div class="frame-info">
          <span class="frame-number">#${i + 1}</span>
        </div>
      `;
      dom.capturedStrip.appendChild(card);
    });
  }

  function clearCaptured() {
    state.capturedFrames = [];
    dom.capturedFramesPanel.classList.add('hidden');
    dom.capturedStrip.innerHTML = '';
    dom.capturedCount.textContent = '0';
  }

  async function exportGif() {
    if (!state.imageLoaded) return;

    const fps = parseInt(dom.exportFps.value) || 24;
    const dur = state.timeline.duration;
    const w = parseInt(dom.exportWidth.value) || state.imageWidth;
    const h = parseInt(dom.exportHeight.value) || state.imageHeight;
    const totalFrames = Math.floor(dur * fps);

    dom.exportProgress.classList.remove('hidden');
    dom.exportProgressFill.style.width = '0%';
    dom.exportProgressText.textContent = '0%';

    // We'll use a simple approach: capture frames then encode
    // Use gif.js from CDN since the npm package has issues with workers
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.js';
    document.head.appendChild(script);

    await new Promise(r => script.onload = r);

    const gif = new window.GIF({
      workers: 2,
      quality: 10,
      width: w,
      height: h,
      workerScript: 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js',
      repeat: 0,
    });

    const delay = 1000 / fps;

    // Save current state
    const savedTime = state.timeline.currentTime;

    for (let i = 0; i <= totalFrames; i++) {
      const t = (i / totalFrames) * dur;
      interpolateAtTime(t);

      // Render
      state.renderer.setSize(w, h);
      state.renderer.render(state.scene, state.camera);

      // Create canvas copy
      const frameCanvas = document.createElement('canvas');
      frameCanvas.width = w;
      frameCanvas.height = h;
      frameCanvas.getContext('2d').drawImage(state.renderer.domElement, 0, 0);
      gif.addFrame(frameCanvas, { delay, copy: true });

      const pct = Math.round((i / totalFrames) * 50);
      dom.exportProgressFill.style.width = `${pct}%`;
      dom.exportProgressText.textContent = `Capturando... ${pct}%`;
    }

    // Restore viewport
    state.renderer.setSize(dom.viewportCanvas.clientWidth, dom.viewportCanvas.clientHeight);
    state.timeline.currentTime = savedTime;
    interpolateAtTime(savedTime);
    updatePlayhead();
    updateTimeDisplay();

    gif.on('progress', (p) => {
      const pct = 50 + Math.round(p * 50);
      dom.exportProgressFill.style.width = `${pct}%`;
      dom.exportProgressText.textContent = `Encodando... ${pct}%`;
    });

    gif.on('finished', (blob) => {
      dom.exportProgressFill.style.width = '100%';
      dom.exportProgressText.textContent = '100% ✓';
      setTimeout(() => dom.exportProgress.classList.add('hidden'), 2000);

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'spriter_animation.gif';
      a.click();
      URL.revokeObjectURL(a.href);
    });

    gif.render();
  }

  async function exportWebM() {
    if (!state.imageLoaded) return;

    const fps = parseInt(dom.exportFps.value) || 24;
    const dur = state.timeline.duration;
    const w = parseInt(dom.exportWidth.value) || state.imageWidth;
    const h = parseInt(dom.exportHeight.value) || state.imageHeight;
    const totalFrames = Math.floor(dur * fps);
    const delay = 1000 / fps;

    dom.exportProgress.classList.remove('hidden');
    dom.exportProgressFill.style.width = '0%';
    dom.exportProgressText.textContent = '0%';

    // Create offscreen canvas for recording
    const recordCanvas = document.createElement('canvas');
    recordCanvas.width = w;
    recordCanvas.height = h;
    const recordCtx = recordCanvas.getContext('2d');

    const stream = recordCanvas.captureStream(0); // 0 = manual frame control
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 5000000,
    });

    const chunks = [];
    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      dom.exportProgressFill.style.width = '100%';
      dom.exportProgressText.textContent = '100% ✓';
      setTimeout(() => dom.exportProgress.classList.add('hidden'), 2000);

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'spriter_animation.webm';
      a.click();
      URL.revokeObjectURL(a.href);
    };

    mediaRecorder.start();

    const savedTime = state.timeline.currentTime;

    for (let i = 0; i <= totalFrames; i++) {
      const t = (i / totalFrames) * dur;
      interpolateAtTime(t);

      state.renderer.setSize(w, h);
      state.renderer.render(state.scene, state.camera);

      recordCtx.clearRect(0, 0, w, h);
      recordCtx.drawImage(state.renderer.domElement, 0, 0);

      // Request a frame from the stream
      const track = stream.getVideoTracks()[0];
      if (track.requestFrame) track.requestFrame();

      // Wait for next frame
      await new Promise(r => setTimeout(r, delay));

      const pct = Math.round((i / totalFrames) * 100);
      dom.exportProgressFill.style.width = `${pct}%`;
      dom.exportProgressText.textContent = `Grabando... ${pct}%`;
    }

    mediaRecorder.stop();

    // Restore
    state.renderer.setSize(dom.viewportCanvas.clientWidth, dom.viewportCanvas.clientHeight);
    state.timeline.currentTime = savedTime;
    interpolateAtTime(savedTime);
    updatePlayhead();
    updateTimeDisplay();
  }

  // ═══════════════════════════════════════
  //  INITIALIZATION
  // ═══════════════════════════════════════
  function init() {
    initThreeJS();
    initUpload();
    initViewportEvents();
    initTools();
    initPanelEvents();
    initTimeline();
    initExport();

    // Handle resize for timeline ruler
    const resizeObserver = new ResizeObserver(() => {
      renderTimelineRuler();
      renderTimelineTracks();
      updatePlayhead();
    });
    resizeObserver.observe(dom.timelineRulerArea);
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
