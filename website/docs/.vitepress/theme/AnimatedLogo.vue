<template>
  <div class="hero-logo-wrapper" role="img" aria-label="Coding Pal Animated Logo">
    <!-- Ambient Breathing Radial Aura -->
    <div class="hero-logo-aura" aria-hidden="true" />

    <!-- Static Orbital Guide Tracks & Telemetry Markers -->
    <svg class="orbit-svg-track" viewBox="0 0 340 340" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="orbitTrackGrad" x1="0" y1="0" x2="340" y2="340" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#3B82F6" stop-opacity="0.45" />
          <stop offset="25%" stop-color="#8B5CF6" stop-opacity="0.3" />
          <stop offset="50%" stop-color="#10B981" stop-opacity="0.4" />
          <stop offset="75%" stop-color="#F59E0B" stop-opacity="0.3" />
          <stop offset="100%" stop-color="#3B82F6" stop-opacity="0.45" />
        </linearGradient>
      </defs>

      <!-- Faint circular guide track -->
      <circle cx="170" cy="170" r="142" class="track-guide-line" />

      <!-- High-precision dashed orbital track -->
      <circle
        cx="170"
        cy="170"
        r="142"
        stroke="url(#orbitTrackGrad)"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-dasharray="3 11"
        class="track-dash-ring"
      />

      <!-- Telemetry Orbit Pips at 45° Cardinal Intersections -->
      <circle cx="270.4" cy="69.6" r="2.2" class="telemetry-pip pip-blue" />
      <circle cx="270.4" cy="270.4" r="2.2" class="telemetry-pip pip-green" />
      <circle cx="69.6" cy="270.4" r="2.2" class="telemetry-pip pip-purple" />
      <circle cx="69.6" cy="69.6" r="2.2" class="telemetry-pip pip-amber" />
    </svg>

    <!-- Smooth Orbiting Primitives Ring -->
    <div class="orbit-rotator" aria-hidden="true">
      <!-- 1. Top (0°): Prompts (Amber) -->
      <div class="orbit-node node-prompt">
        <div class="node-rotator">
          <div class="node-card" title="Prompts: Interactive slash commands">
            <svg class="node-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="16" y1="4.5" x2="8" y2="19.5" />
              <circle cx="5" cy="12" r="1.25" fill="currentColor" stroke="none" />
              <circle cx="19" cy="12" r="1.25" fill="currentColor" stroke="none" />
            </svg>
            <span class="node-label">Prompts</span>
          </div>
        </div>
      </div>

      <!-- 2. Right (90°): Agents (Royal Blue) -->
      <div class="orbit-node node-agent">
        <div class="node-rotator">
          <div class="node-card" title="Agents: Named specialists">
            <svg class="node-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="4" y="8" width="16" height="12" rx="3.5" />
              <path d="M12 5V2" />
              <circle cx="12" cy="2" r="1" fill="currentColor" />
              <circle cx="9" cy="13" r="1.5" fill="currentColor" />
              <circle cx="15" cy="13" r="1.5" fill="currentColor" />
              <path d="M2 13h2" />
              <path d="M20 13h2" />
              <path d="M9.5 17h5" />
            </svg>
            <span class="node-label">Agents</span>
          </div>
        </div>
      </div>

      <!-- 3. Bottom (180°): Instructions (Emerald) -->
      <div class="orbit-node node-instruction">
        <div class="node-rotator">
          <div class="node-card" title="Instructions: Always-on standards">
            <svg class="node-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
              <path d="M14 2v6h6" />
              <path d="M9 13.5l2 2 4-4" />
            </svg>
            <span class="node-label">Instructions</span>
          </div>
        </div>
      </div>

      <!-- 4. Left (270°): Skills (Purple) -->
      <div class="orbit-node node-skill">
        <div class="node-rotator">
          <div class="node-card" title="Skills: Executable bundles & validators">
            <svg class="node-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M13 2L4.5 13.5H11.5L10.5 22L19.5 10.5H12.5L13 2Z" />
            </svg>
            <span class="node-label">Skills</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Central Coding Pal Emblem Badge -->
    <div class="hero-logo-center">
      <svg
        class="emblem-svg"
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="badgeGrad" x1="0" y1="0" x2="200" y2="200" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#3B82F6" />
            <stop offset="50%" stop-color="#2563EB" />
            <stop offset="100%" stop-color="#1D4ED8" />
          </linearGradient>
          <linearGradient id="borderGrad" x1="0" y1="0" x2="200" y2="200" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#BFDBFE" stop-opacity="0.95" />
            <stop offset="50%" stop-color="#60A5FA" stop-opacity="0.6" />
            <stop offset="100%" stop-color="#1E40AF" stop-opacity="0.85" />
          </linearGradient>
          <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <!-- Ambient Badge Shadow -->
        <rect
          x="18"
          y="18"
          width="164"
          height="164"
          rx="44"
          fill="#1E3A8A"
          fill-opacity="0.35"
          filter="url(#softGlow)"
        />

        <!-- Main Squircle Card -->
        <rect
          x="18"
          y="18"
          width="164"
          height="164"
          rx="44"
          fill="url(#badgeGrad)"
          stroke="url(#borderGrad)"
          stroke-width="3"
        />

        <!-- Top Highlight Bevel -->
        <path
          d="M36 44C36 37.37 41.37 32 48 32H152C158.63 32 164 37.37 164 44"
          stroke="white"
          stroke-opacity="0.28"
          stroke-width="2.5"
          stroke-linecap="round"
        />

        <!-- Terminal Prompt Chevron (>) -->
        <path
          class="code-chevron"
          d="M66 68L102 100L66 132"
          stroke="white"
          stroke-width="12"
          stroke-linecap="round"
          stroke-linejoin="round"
        />

        <!-- Blinking Terminal Cursor (_) -->
        <path
          class="code-cursor"
          d="M116 132H146"
          stroke="#93C5FD"
          stroke-width="12"
          stroke-linecap="round"
        />
      </svg>
    </div>
  </div>
</template>

<style scoped>
.hero-logo-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 360px;
  height: 360px;
  margin: 0 auto;
  user-select: none;
}

/* Ambient Radial Aura Behind Badge */
.hero-logo-aura {
  position: absolute;
  width: 260px;
  height: 260px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(37, 99, 235, 0.38) 0%, rgba(96, 165, 250, 0.16) 45%, transparent 72%);
  filter: blur(40px);
  animation: aura-breathe 4s ease-in-out infinite;
  pointer-events: none;
}

.dark .hero-logo-aura {
  background: radial-gradient(circle, rgba(59, 130, 246, 0.48) 0%, rgba(37, 99, 235, 0.22) 50%, transparent 72%);
}

/* Orbital Vector Guide Tracks */
.orbit-svg-track {
  position: absolute;
  width: 340px;
  height: 340px;
  pointer-events: none;
}

.track-guide-line {
  stroke: rgba(59, 130, 246, 0.12);
  stroke-width: 1px;
}

.dark .track-guide-line {
  stroke: rgba(96, 165, 250, 0.16);
}

.telemetry-pip {
  transition: opacity 0.3s ease;
}

.pip-blue { fill: #60a5fa; fill-opacity: 0.55; }
.pip-green { fill: #34d399; fill-opacity: 0.55; }
.pip-purple { fill: #a78bfa; fill-opacity: 0.55; }
.pip-amber { fill: #fbbf24; fill-opacity: 0.55; }

/* Central Floating Emblem Badge */
.hero-logo-center {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 200px;
  height: 200px;
  animation: logo-levitate 5s ease-in-out infinite;
  z-index: 2;
  pointer-events: none;
}

.emblem-svg {
  width: 190px;
  height: 190px;
  filter: drop-shadow(0 14px 28px rgba(29, 78, 216, 0.38));
}

/* Terminal Chevron Glowing Pulse */
.code-chevron {
  animation: chevron-pulse 3s ease-in-out infinite;
}

/* Blinking Terminal Cursor */
.code-cursor {
  animation: cursor-blink 1.05s steps(1) infinite;
}

/* Orbit Rotator Container: Perfectly Centered on Mathematical Origin */
.orbit-rotator {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  animation: orbit-spin 26s linear infinite;
  z-index: 3;
  pointer-events: none;
}

/* Smooth Pause on Logo Hover */
.hero-logo-wrapper:hover .orbit-rotator,
.hero-logo-wrapper:hover .node-rotator {
  animation-play-state: paused;
}

/* Orbital Node Positions: Exact 142px Polar Radius from Center */
.orbit-node {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.node-prompt {
  transform: translateY(-142px);
}

.node-agent {
  transform: translateX(142px);
}

.node-instruction {
  transform: translateY(142px);
}

.node-skill {
  transform: translateX(-142px);
}

/* Counter-Rotator: Keeps Cards Upright Without Transform Conflicts */
.node-rotator {
  display: flex;
  align-items: center;
  justify-content: center;
  animation: orbit-counter-spin 26s linear infinite;
  pointer-events: auto;
}

/* Node Card Styling: Glassmorphic Capsule Squircle */
.node-card {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 13px;
  cursor: pointer;
  transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1),
              box-shadow 0.28s ease,
              border-color 0.28s ease;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.node-card:hover {
  transform: scale(1.18);
  z-index: 10;
}

.node-icon {
  width: 22px;
  height: 22px;
  transition: transform 0.25s ease;
}

.node-card:hover .node-icon {
  transform: scale(1.08);
}

/* Tooltip Label Appearing on Hover */
.node-label {
  position: absolute;
  top: calc(100% + 7px);
  left: 50%;
  transform: translateX(-50%) translateY(-4px);
  padding: 3px 8px;
  border-radius: 6px;
  font-family: var(--vp-font-family-base, system-ui, -apple-system, sans-serif);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease, transform 0.2s ease;
  background: rgba(15, 23, 42, 0.92);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  z-index: 20;
}

.node-card:hover .node-label {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

/* ==========================================================================
   Primitive-Specific Themes (Light & Dark Mode)
   ========================================================================== */

/* 1. Prompt Node: Amber */
.node-prompt .node-card {
  background: rgba(255, 251, 235, 0.88);
  border: 1.5px solid rgba(245, 158, 11, 0.42);
  color: #d97706;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06), 0 0 14px rgba(245, 158, 11, 0.18);
}

.node-prompt .node-card:hover {
  border-color: #f59e0b;
  box-shadow: 0 6px 20px rgba(245, 158, 11, 0.35), 0 0 0 2px rgba(245, 158, 11, 0.2);
}

.dark .node-prompt .node-card {
  background: rgba(30, 24, 15, 0.88);
  border: 1.5px solid rgba(251, 191, 36, 0.45);
  color: #fbbf24;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35), 0 0 16px rgba(245, 158, 11, 0.24);
}

.dark .node-prompt .node-card:hover {
  border-color: #fbbf24;
  box-shadow: 0 6px 22px rgba(245, 158, 11, 0.45), 0 0 0 2px rgba(251, 191, 36, 0.25);
}

/* 2. Agent Node: Royal Blue */
.node-agent .node-card {
  background: rgba(239, 246, 255, 0.88);
  border: 1.5px solid rgba(59, 130, 246, 0.42);
  color: #2563eb;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06), 0 0 14px rgba(59, 130, 246, 0.2);
}

.node-agent .node-card:hover {
  border-color: #3b82f6;
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.38), 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.dark .node-agent .node-card {
  background: rgba(15, 23, 42, 0.88);
  border: 1.5px solid rgba(96, 165, 250, 0.45);
  color: #60a5fa;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35), 0 0 16px rgba(59, 130, 246, 0.25);
}

.dark .node-agent .node-card:hover {
  border-color: #60a5fa;
  box-shadow: 0 6px 22px rgba(59, 130, 246, 0.45), 0 0 0 2px rgba(96, 165, 250, 0.25);
}

/* 3. Instruction Node: Emerald */
.node-instruction .node-card {
  background: rgba(236, 253, 245, 0.88);
  border: 1.5px solid rgba(16, 185, 129, 0.42);
  color: #059669;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06), 0 0 14px rgba(16, 185, 129, 0.18);
}

.node-instruction .node-card:hover {
  border-color: #10b981;
  box-shadow: 0 6px 20px rgba(16, 185, 129, 0.35), 0 0 0 2px rgba(16, 185, 129, 0.2);
}

.dark .node-instruction .node-card {
  background: rgba(6, 30, 23, 0.88);
  border: 1.5px solid rgba(52, 211, 153, 0.45);
  color: #34d399;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35), 0 0 16px rgba(16, 185, 129, 0.24);
}

.dark .node-instruction .node-card:hover {
  border-color: #34d399;
  box-shadow: 0 6px 22px rgba(16, 185, 129, 0.45), 0 0 0 2px rgba(52, 211, 153, 0.25);
}

/* 4. Skill Node: Purple / Violet */
.node-skill .node-card {
  background: rgba(245, 243, 255, 0.88);
  border: 1.5px solid rgba(139, 92, 246, 0.42);
  color: #7c3aed;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06), 0 0 14px rgba(139, 92, 246, 0.2);
}

.node-skill .node-card:hover {
  border-color: #8b5cf6;
  box-shadow: 0 6px 20px rgba(139, 92, 246, 0.38), 0 0 0 2px rgba(139, 92, 246, 0.2);
}

.dark .node-skill .node-card {
  background: rgba(26, 16, 43, 0.88);
  border: 1.5px solid rgba(167, 139, 250, 0.45);
  color: #a78bfa;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35), 0 0 16px rgba(139, 92, 246, 0.25);
}

.dark .node-skill .node-card:hover {
  border-color: #a78bfa;
  box-shadow: 0 6px 22px rgba(139, 92, 246, 0.45), 0 0 0 2px rgba(167, 139, 250, 0.25);
}

/* ==========================================================================
   Keyframe Animations: Pure Compositor Transforms Only
   ========================================================================== */

/* Center Emblem Vertical Floating Levitation (Zero Tilt Wobble) */
@keyframes logo-levitate {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}

/* Radial Aura Breathing */
@keyframes aura-breathe {
  0%, 100% {
    transform: scale(0.96);
    opacity: 0.65;
  }
  50% {
    transform: scale(1.06);
    opacity: 0.95;
  }
}

/* Smooth Clockwise Orbital Revolution */
@keyframes orbit-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Smooth Counter-Rotation (Keeps Icons Perfectly Upright) */
@keyframes orbit-counter-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(-360deg);
  }
}

/* Blinking Terminal Cursor */
@keyframes cursor-blink {
  0%, 49% {
    opacity: 1;
  }
  50%, 100% {
    opacity: 0;
  }
}

/* Terminal Chevron Glowing Pulse */
@keyframes chevron-pulse {
  0%, 100% {
    filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.4));
  }
  50% {
    filter: drop-shadow(0 0 8px rgba(147, 197, 253, 0.9));
  }
}

/* Responsive Sizing for Mobile Screens */
@media (max-width: 640px) {
  .hero-logo-wrapper {
    max-width: 300px;
    height: 300px;
    transform: scale(0.85);
  }
}

/* Accessibility: Respect Reduced Motion Preferences */
@media (prefers-reduced-motion: reduce) {
  .hero-logo-aura,
  .hero-logo-center,
  .orbit-rotator,
  .node-rotator,
  .code-cursor,
  .code-chevron {
    animation: none !important;
  }
}
</style>
