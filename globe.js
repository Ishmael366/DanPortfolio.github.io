(() => {
  'use strict';

  const canvas = document.getElementById('labyrinth-globe');
  const coastlineData = globalThis.labyrinthLandRings;
  if (!canvas || !coastlineData?.length || typeof Path2D === 'undefined') return;

  const context = canvas.getContext('2d');
  if (!context) return;

  const width = 760;
  const height = 520;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = 198;
  const surfaceSize = 480;
  const oceanColors = [[7, 13, 55], [17, 71, 155], [49, 210, 225]];
  const landColors = [[22, 44, 58], [63, 139, 95], [249, 216, 122]];
  const initialLongitude = -72;
  const initialLatitude = 34;
  const degrees = Math.PI / 180;
  const circle = Math.PI * 2;
  const bay = spherePoint(-76.25, 37.95);
  const status = document.getElementById('globe-status');
  const controls = document.querySelector('.globe-controls');
  const pauseButton = document.querySelector('[data-globe-pause]');
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');

  let longitude = initialLongitude;
  let latitude = initialLatitude;
  let pixelRatio = 1;
  let visible = typeof IntersectionObserver === 'undefined';
  let automaticRotation = true;
  let automaticDuration = 0;
  let animationFrame = 0;
  let previousFrame = 0;
  let hovered = false;
  let focused = false;
  let gesture = null;
  let surfaces;

  const coastlines = coastlineData.map((coordinates) => {
    // GeoJSON closes rings by repeating the first vertex. The renderer closes them itself.
    const end = coordinates.length - 2;
    const closed = coordinates[0] === coordinates[end] && coordinates[1] === coordinates[end + 1];
    const count = (closed ? end : coordinates.length) / 2;
    const sphere = new Float32Array(count * 3);
    for (let index = 0; index < count; index++) {
      sphere.set(spherePoint(coordinates[index * 2], coordinates[index * 2 + 1]), index * 3);
    }
    return { coordinates, sphere, projected: new Float32Array(sphere.length), count };
  });

  const grid = [];
  for (let parallel = -75; parallel <= 75; parallel += 15) {
    const line = [];
    for (let meridian = -180; meridian <= 180; meridian += 4) {
      line.push(...spherePoint(meridian, parallel));
    }
    grid.push(line);
  }
  for (let meridian = -180; meridian < 180; meridian += 15) {
    const line = [];
    for (let parallel = -90; parallel <= 90; parallel += 3) {
      line.push(...spherePoint(meridian, parallel));
    }
    grid.push(line);
  }

  function spherePoint(lon, lat) {
    const angle = lon * degrees;
    const elevation = lat * degrees;
    const horizontal = Math.cos(elevation);
    return [horizontal * Math.cos(angle), horizontal * Math.sin(angle), Math.sin(elevation)];
  }

  function orientation() {
    const meridian = longitude * degrees;
    const parallel = latitude * degrees;
    return {
      cosineLongitude: Math.cos(meridian),
      sineLongitude: Math.sin(meridian),
      cosineLatitude: Math.cos(parallel),
      sineLatitude: Math.sin(parallel),
    };
  }

  function project(source, offset, view, target, outputOffset) {
    const x = source[offset];
    const y = source[offset + 1];
    const z = source[offset + 2];
    const forward = x * view.cosineLongitude + y * view.sineLongitude;
    target[outputOffset] = y * view.cosineLongitude - x * view.sineLongitude;
    target[outputOffset + 1] = forward * view.sineLatitude - z * view.cosineLatitude;
    target[outputOffset + 2] = forward * view.cosineLatitude + z * view.sineLatitude;
  }

  function horizon(x1, y1, z1, x2, y2, z2) {
    const fraction = z1 / (z1 - z2);
    const angle = Math.atan2(y1 + fraction * (y2 - y1), x1 + fraction * (x2 - x1));
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
      angle,
    };
  }

  function longitudeInRange(value) {
    return ((value + 180) % 360 + 360) % 360 - 180;
  }

  function includesMapCenter({ coordinates, count }) {
    let inside = false;
    for (let index = 0, previous = count - 1; index < count; previous = index++) {
      const x = coordinates[index * 2];
      const y = coordinates[index * 2 + 1];
      const previousX = coordinates[previous * 2];
      const previousY = coordinates[previous * 2 + 1];
      if ((y > latitude) === (previousY > latitude)) continue;
      const intersection = x + (previousX - x) * (latitude - y) / (previousY - y);
      if (longitude < intersection) inside = !inside;
    }
    return inside;
  }

  function appendDisk(path) {
    path.moveTo(centerX + radius, centerY);
    path.arc(centerX, centerY, radius, 0, circle);
    path.closePath();
  }

  function grain(x, y) {
    const seed = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    const mixed = Math.imul(seed ^ (seed >>> 13), 1274126177);
    return ((mixed ^ (mixed >>> 16)) >>> 0) / 4294967296;
  }

  function noise(x, y) {
    const column = Math.floor(x);
    const row = Math.floor(y);
    const u = x - column;
    const v = y - row;
    const horizontal = u * u * (3 - 2 * u);
    const vertical = v * v * (3 - 2 * v);
    const top = grain(column, row) * (1 - horizontal) + grain(column + 1, row) * horizontal;
    const bottom = grain(column, row + 1) * (1 - horizontal) + grain(column + 1, row + 1) * horizontal;
    return top * (1 - vertical) + bottom * vertical;
  }

  function paintPixel(pixels, offset, colors, tone) {
    const position = Math.max(0, Math.min(1, tone)) * 2;
    const index = position < 1 ? 0 : 1;
    const weight = position - index;
    for (let channel = 0; channel < 3; channel++) {
      pixels[offset + channel] = colors[index][channel] * (1 - weight) + colors[index + 1][channel] * weight;
    }
    pixels[offset + 3] = 255;
  }

  function makeSurfaces() {
    const ocean = document.createElement('canvas');
    const land = document.createElement('canvas');
    ocean.width = ocean.height = land.width = land.height = surfaceSize;
    const waterContext = ocean.getContext('2d');
    const landContext = land.getContext('2d');
    const waterPixels = waterContext.createImageData(surfaceSize, surfaceSize);
    const landPixels = landContext.createImageData(surfaceSize, surfaceSize);

    // Cache the shaded texture once. The geographic outlines still project as the globe turns.
    for (let y = 0; y < surfaceSize; y++) {
      for (let x = 0; x < surfaceSize; x++) {
        const horizontal = (x + 0.5) * 2 / surfaceSize - 1;
        const vertical = (y + 0.5) * 2 / surfaceSize - 1;
        const depth = Math.sqrt(Math.max(0, 1 - horizontal ** 2 - vertical ** 2));
        const light = Math.max(0, -horizontal * 0.48 - vertical * 0.52 + depth * 0.71);
        const broad = noise(horizontal * 4.5 + 14, vertical * 4.5 + 8);
        const detail = noise(horizontal * 19 + 31, vertical * 16 + 21);
        const fine = noise(horizontal * 52 + 22, vertical * 52 + 24);
        const speckle = grain(x, y) - 0.5;
        const current = Math.sin((horizontal * 0.42 + vertical) * 70 + broad * 15 + detail * 2);
        const waterTone = 0.16 + light * 0.67 + (broad - 0.5) * 0.19
          + (detail - 0.5) * 0.05 + current * 0.023 + speckle * 0.027;
        const ridge = 1 - Math.abs(detail * 2 - 1);
        const terrainTone = 0.12 + light * 0.48 + broad * 0.24 + ridge * 0.13
          + (fine - 0.5) * 0.13 + speckle * 0.055;
        const offset = (y * surfaceSize + x) * 4;
        paintPixel(waterPixels.data, offset, oceanColors, waterTone);
        paintPixel(landPixels.data, offset, landColors, terrainTone);
      }
    }

    waterContext.putImageData(waterPixels, 0, 0);
    landContext.putImageData(landPixels, 0, 0);
    return { ocean, land };
  }

  function drawSurface(surface) {
    context.drawImage(surface, centerX - radius, centerY - radius, radius * 2, radius * 2);
  }

  function drawLand(view) {
    const land = new Path2D();
    const shore = new Path2D();

    // The point-in-path check below uses the fixed 760 × 520 design coordinates.
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);

    for (const ring of coastlines) {
      const { sphere, projected, count } = ring;
      let hiddenIndex = -1;
      let visibleCount = 0;
      for (let index = 0; index < count; index++) {
        const offset = index * 3;
        project(sphere, offset, view, projected, offset);
        if (projected[offset + 2] < 0) hiddenIndex = index;
        else visibleCount++;
      }

      if (!visibleCount) {
        if (includesMapCenter(ring)) appendDisk(land);
        continue;
      }

      if (visibleCount === count) {
        land.moveTo(centerX + radius * projected[0], centerY + radius * projected[1]);
        shore.moveTo(centerX + radius * projected[0], centerY + radius * projected[1]);
        for (let index = 1; index < count; index++) {
          const x = centerX + radius * projected[index * 3];
          const y = centerY + radius * projected[index * 3 + 1];
          land.lineTo(x, y);
          shore.lineTo(x, y);
        }
        land.closePath();
        shore.closePath();
        continue;
      }

      // Cut at the hemisphere edge and connect each visible span along the rim.
      // Even-odd filling preserves holes and overlapping spans along that edge.
      const clipped = new Path2D();
      let entrance;
      let previous = hiddenIndex * 3;
      for (let step = 1; step <= count; step++) {
        const offset = ((hiddenIndex + step) % count) * 3;
        const previousDepth = projected[previous + 2];
        const depth = projected[offset + 2];
        const x = centerX + radius * projected[offset];
        const y = centerY + radius * projected[offset + 1];

        if ((previousDepth < 0) !== (depth < 0)) {
          const edge = horizon(projected[previous], projected[previous + 1], previousDepth,
            projected[offset], projected[offset + 1], depth);
          if (depth >= 0) {
            entrance = edge;
            clipped.moveTo(edge.x, edge.y);
            shore.moveTo(edge.x, edge.y);
          } else {
            clipped.lineTo(edge.x, edge.y);
            shore.lineTo(edge.x, edge.y);
            const sweep = longitudeInRange((entrance.angle - edge.angle) / degrees) * degrees;
            clipped.arc(centerX, centerY, radius, edge.angle, edge.angle + sweep, sweep < 0);
            clipped.closePath();
          }
        }
        if (depth >= 0) {
          clipped.lineTo(x, y);
          shore.lineTo(x, y);
        }
        previous = offset;
      }

      // Either parity has the same inland edges. Match the geographically known center.
      const centerFilled = context.isPointInPath(clipped, centerX, centerY, 'evenodd');
      if (centerFilled !== includesMapCenter(ring)) appendDisk(clipped);
      land.addPath(clipped);
    }

    context.restore();
    context.save();
    context.clip(land, 'evenodd');
    drawSurface(surfaces.land);
    context.restore();
    context.strokeStyle = 'rgba(96, 239, 224, .19)';
    context.lineWidth = 3;
    context.lineJoin = 'round';
    context.stroke(shore);
    context.strokeStyle = 'rgba(225, 248, 170, .65)';
    context.lineWidth = 0.85;
    context.stroke(shore);
  }

  function drawGrid(view) {
    const path = new Path2D();
    const previous = [0, 0, 0];
    const current = [0, 0, 0];

    for (const line of grid) {
      project(line, 0, view, previous, 0);
      if (previous[2] >= 0) {
        path.moveTo(centerX + radius * previous[0], centerY + radius * previous[1]);
      }
      for (let offset = 3; offset < line.length; offset += 3) {
        project(line, offset, view, current, 0);
        if ((previous[2] < 0) !== (current[2] < 0)) {
          const edge = horizon(...previous, ...current);
          if (current[2] >= 0) path.moveTo(edge.x, edge.y);
          else path.lineTo(edge.x, edge.y);
        }
        if (current[2] >= 0) {
          path.lineTo(centerX + radius * current[0], centerY + radius * current[1]);
        }
        previous[0] = current[0];
        previous[1] = current[1];
        previous[2] = current[2];
      }
    }

    context.strokeStyle = 'rgba(184, 230, 252, .17)';
    context.lineWidth = 0.62;
    context.stroke(path);
  }

  function drawFrame() {
    context.save();
    const aura = context.createRadialGradient(centerX, centerY, radius - 20,
      centerX, centerY, radius + 52);
    aura.addColorStop(0, 'rgba(57, 152, 255, 0)');
    aura.addColorStop(0.28, 'rgba(67, 172, 255, .37)');
    aura.addColorStop(0.61, 'rgba(46, 114, 232, .13)');
    aura.addColorStop(1, 'rgba(35, 88, 195, 0)');
    context.fillStyle = aura;
    context.fillRect(0, 0, width, height);

    context.beginPath();
    context.arc(centerX, centerY, radius + 21, 0, circle);
    context.lineWidth = 0.7;
    context.strokeStyle = 'rgba(126, 193, 255, .29)';
    context.stroke();

    context.beginPath();
    context.arc(centerX, centerY, radius + 30, -0.25, 0.44);
    context.moveTo(centerX + (radius + 30) * Math.cos(2.9), centerY + (radius + 30) * Math.sin(2.9));
    context.arc(centerX, centerY, radius + 30, 2.9, 3.33);
    context.setLineDash([1, 5]);
    context.strokeStyle = 'rgba(126, 193, 255, .31)';
    context.stroke();
    context.setLineDash([]);

    for (const [x, y] of [[145, 138], [611, 372]]) {
      context.beginPath();
      context.moveTo(x - 4, y);
      context.lineTo(x + 4, y);
      context.moveTo(x, y - 4);
      context.lineTo(x, y + 4);
      context.strokeStyle = 'rgba(141, 207, 255, .47)';
      context.stroke();
    }
    context.restore();
  }

  function drawBay(view) {
    const point = [0, 0, 0];
    project(bay, 0, view, point, 0);
    if (point[2] <= 0.025) return;

    const x = centerX + radius * point[0];
    const y = centerY + radius * point[1];
    context.save();
    context.globalAlpha = Math.min(1, point[2] * 7);
    context.beginPath();
    context.arc(x, y, 14, 0, circle);
    context.fillStyle = 'rgba(255, 207, 113, .22)';
    context.fill();
    context.strokeStyle = 'rgba(255, 222, 150, .86)';
    context.lineWidth = 0.8;
    context.stroke();

    context.beginPath();
    context.arc(x, y, 4.8, 0, circle);
    context.fillStyle = '#ffe49a';
    context.fill();
    context.lineWidth = 1.3;
    context.strokeStyle = '#151f39';
    context.stroke();

    const label = 'CHESAPEAKE BAY';
    const right = x < 490;
    const lineX = x + (right ? 41 : -41);
    const lineY = y - 25;
    context.font = '700 11px system-ui, sans-serif';
    const boxWidth = context.measureText(label).width + 18;
    const boxX = right ? lineX : lineX - boxWidth;
    context.beginPath();
    context.moveTo(x + (right ? 12 : -12), y - 7);
    context.lineTo(x + (right ? 30 : -30), lineY);
    context.lineTo(lineX, lineY);
    context.strokeStyle = 'rgba(255, 223, 149, .9)';
    context.lineWidth = 1;
    context.stroke();
    context.fillStyle = 'rgba(11, 23, 46, .95)';
    context.fillRect(boxX, lineY - 11, boxWidth, 22);
    context.strokeStyle = 'rgba(255, 221, 149, .67)';
    context.strokeRect(boxX, lineY - 11, boxWidth, 22);
    context.fillStyle = '#fff2cc';
    context.textBaseline = 'middle';
    context.fillText(label, boxX + 9, lineY);
    context.restore();
  }

  function draw() {
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    drawFrame();

    const view = orientation();
    const globe = new Path2D();
    appendDisk(globe);
    context.save();
    context.clip(globe);
    drawSurface(surfaces.ocean);
    drawLand(view);
    drawGrid(view);
    context.restore();

    const rim = context.createLinearGradient(230, 107, 530, 415);
    rim.addColorStop(0, '#c9f8ff');
    rim.addColorStop(0.52, '#5cc3ff');
    rim.addColorStop(1, '#786cdf');
    context.strokeStyle = rim;
    context.lineWidth = 1.6;
    context.stroke(globe);
    drawBay(view);
  }

  function resize() {
    const scale = canvas.getBoundingClientRect().width / width || 1;
    pixelRatio = Math.min(2, Math.max(1, (window.devicePixelRatio || 1) * scale));
    const nextWidth = Math.round(width * pixelRatio);
    const nextHeight = Math.round(height * pixelRatio);
    if (canvas.width !== nextWidth) canvas.width = nextWidth;
    if (canvas.height !== nextHeight) canvas.height = nextHeight;
    draw();
  }

  function canRotateAutomatically() {
    return automaticRotation && (pauseButton || automaticDuration < 4000) &&
      visible && !document.hidden && !motionPreference.matches && !hovered && !focused && !gesture;
  }

  function animate(time) {
    animationFrame = 0;
    if (!canRotateAutomatically()) return;

    if (!previousFrame) previousFrame = time;
    const elapsed = time - previousFrame;
    if (elapsed >= 33) {
      previousFrame = time;
      const interval = Math.min(elapsed, 100);
      automaticDuration += interval;
      longitude = longitudeInRange(longitude + interval * 0.002);
      draw();
    }
    synchronizeAnimation();
  }

  function synchronizeAnimation() {
    if (canRotateAutomatically()) {
      if (!animationFrame) animationFrame = requestAnimationFrame(animate);
      return;
    }
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    previousFrame = 0;
  }

  function setAutomaticRotation(enabled) {
    automaticRotation = enabled;
    if (pauseButton) {
      pauseButton.textContent = enabled ? 'Pause' : 'Play';
      pauseButton.setAttribute('aria-label', enabled ? 'Pause globe rotation' : 'Play globe rotation');
    }
    synchronizeAnimation();
  }

  function announce(message) {
    if (!status) return;
    const position = [0, 0, 0];
    project(bay, 0, orientation(), position, 0);
    const location = position[2] > 0.025 ? 'Chesapeake Bay is visible.' : 'Chesapeake Bay is on the far side.';
    status.textContent = `${message} ${location}`;
  }

  function rotate(longitudeChange, latitudeChange, message) {
    setAutomaticRotation(false);
    longitude = longitudeInRange(longitude + longitudeChange);
    latitude = Math.max(-78, Math.min(78, latitude + latitudeChange));
    draw();
    announce(message);
  }

  function reset() {
    setAutomaticRotation(false);
    longitude = initialLongitude;
    latitude = initialLatitude;
    draw();
    announce('Globe centered on the Atlantic coast.');
  }

  function finishGesture(event) {
    if (gesture?.pointer !== event.pointerId) return;
    const moved = gesture.active;
    gesture = null;
    canvas.classList.remove('is-dragging');
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (moved) announce('Globe turned.');
    synchronizeAnimation();
  }

  // Leave the static illustration in place if canvas rendering cannot initialize.
  try {
    surfaces = makeSurfaces();
    resize();
  } catch {
    return;
  }

  canvas.style.touchAction = 'pan-y pinch-zoom';
  canvas.classList.add('is-ready');
  if (controls) controls.hidden = false;
  if (pauseButton) pauseButton.hidden = motionPreference.matches;
  if (status) status.setAttribute('role', 'status');
  resize();

  document.querySelector('[data-globe-turn="left"]')?.addEventListener('click', () => rotate(24, 0, 'Globe turned left.'));
  document.querySelector('[data-globe-turn="right"]')?.addEventListener('click', () => rotate(-24, 0, 'Globe turned right.'));
  document.querySelector('[data-globe-reset]')?.addEventListener('click', reset);
  pauseButton?.addEventListener('click', () => {
    if (motionPreference.matches) return;
    setAutomaticRotation(!automaticRotation);
    announce(automaticRotation ? 'Automatic rotation enabled.' : 'Automatic rotation paused.');
  });

  canvas.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    switch (event.key) {
      case 'ArrowLeft':
        rotate(24, 0, 'Globe turned left.');
        break;
      case 'ArrowRight':
        rotate(-24, 0, 'Globe turned right.');
        break;
      case 'ArrowUp':
        rotate(0, 14, 'Globe turned north.');
        break;
      case 'ArrowDown':
        rotate(0, -14, 'Globe turned south.');
        break;
      case 'Home':
        reset();
        break;
      default:
        return;
    }
    event.preventDefault();
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 || gesture) return;
    gesture = {
      pointer: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLongitude: longitude,
      active: false,
    };
    synchronizeAnimation();
  });

  canvas.addEventListener('pointermove', (event) => {
    if (gesture?.pointer !== event.pointerId) return;
    const horizontal = event.clientX - gesture.startX;
    const vertical = event.clientY - gesture.startY;
    if (!gesture.active) {
      if (Math.abs(vertical) > 7 && Math.abs(vertical) > Math.abs(horizontal) && event.pointerType === 'touch') {
        finishGesture(event);
        return;
      }
      if (Math.abs(horizontal) < 6) return;
      gesture.active = true;
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add('is-dragging');
      setAutomaticRotation(false);
    }
    const viewportWidth = canvas.getBoundingClientRect().width || width;
    longitude = longitudeInRange(gesture.startLongitude - horizontal * 215 / viewportWidth);
    draw();
  });

  canvas.addEventListener('pointerup', finishGesture);
  canvas.addEventListener('pointercancel', finishGesture);
  canvas.addEventListener('lostpointercapture', finishGesture);
  canvas.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'touch') return;
    hovered = true;
    synchronizeAnimation();
  });
  canvas.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'touch') return;
    hovered = false;
    if (gesture && !gesture.active) finishGesture(event);
    synchronizeAnimation();
  });
  canvas.addEventListener('focus', () => {
    focused = true;
    synchronizeAnimation();
  });
  canvas.addEventListener('blur', () => {
    focused = false;
    synchronizeAnimation();
  });

  function updateMotionPreference() {
    if (pauseButton) pauseButton.hidden = motionPreference.matches;
    synchronizeAnimation();
  }

  if (motionPreference.addEventListener) motionPreference.addEventListener('change', updateMotionPreference);
  else motionPreference.addListener?.(updateMotionPreference);

  document.addEventListener('visibilitychange', synchronizeAnimation);
  if (typeof IntersectionObserver !== 'undefined') {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && entry.intersectionRatio >= 0.1;
      synchronizeAnimation();
    }, { threshold: 0.1 }).observe(canvas);
  }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize', resize);

  synchronizeAnimation();
})();
