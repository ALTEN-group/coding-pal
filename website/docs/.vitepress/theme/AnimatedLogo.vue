<template>
  <div class="hero-logo-wrapper">
    <!-- Ambient Pulsing Radial Aura -->
    <div class="hero-logo-aura" />

    <!-- Floating Emblem & Orbitals -->
    <div class="hero-logo-body">
      <!-- Orbiting Context Primitive Ring -->
      <div class="orbit-track">
        <!-- 1. Prompt (Amber) -->
        <div class="orbit-node node-prompt">
          <div class="node-inner">
            <span class="node-symbol">/</span>
          </div>
        </div>

        <!-- 2. Agent (Royal Blue) -->
        <div class="orbit-node node-agent">
          <div class="node-inner">
            <span class="node-symbol">🤖</span>
          </div>
        </div>

        <!-- 3. Instruction (Cyan) -->
        <div class="orbit-node node-instruction">
          <div class="node-inner">
            <span class="node-symbol">📋</span>
          </div>
        </div>

        <!-- 4. Skill (Purple) -->
        <div class="orbit-node node-skill">
          <div class="node-inner">
            <span class="node-symbol">⚡</span>
          </div>
        </div>
      </div>

      <!-- Central Coding Pal Emblem Badge -->
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
  pointer-events: none;
}

/* Ambient Radial Aura Behind Badge */
.hero-logo-aura {
  position: absolute;
  width: 260px;
  height: 260px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(37, 99, 235, 0.4) 0%, rgba(96, 165, 250, 0.18) 45%, transparent 72%);
  filter: blur(40px);
  animation: aura-breathe 4s ease-in-out infinite;
}

.dark .hero-logo-aura {
  background: radial-gradient(circle, rgba(59, 130, 246, 0.5) 0%, rgba(37, 99, 235, 0.25) 50%, transparent 72%);
}

/* Floating Levitating Emblem */
.hero-logo-body {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 220px;
  height: 220px;
  animation: logo-levitate 4.5s ease-in-out infinite;
}

.emblem-svg {
  width: 190px;
  height: 190px;
  filter: drop-shadow(0 12px 24px rgba(29, 78, 216, 0.35));
}

/* Terminal Chevron Glowing Pulse */
.code-chevron {
  animation: chevron-pulse 3s ease-in-out infinite;
}

/* Blinking Terminal Cursor */
.code-cursor {
  animation: cursor-blink 1.05s steps(1) infinite;
}

/* Orbiting Primitives Ring */
.orbit-track {
  position: absolute;
  width: 280px;
  height: 280px;
  border-radius: 50%;
  border: 1px dashed rgba(59, 130, 246, 0.28);
  animation: orbit-rotate 22s linear infinite;
}

/* Primitive Node Badges */
.orbit-node {
  position: absolute;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* Counter-rotate inner content to stay upright */
.node-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  animation: orbit-counter-rotate 22s linear infinite;
  font-size: 16px;
  font-weight: 700;
}

/* Positions around the circle */
/* 1. Top: Prompts (Amber) */
.node-prompt {
  top: -19px;
  left: calc(50% - 19px);
  background: #f59e0b;
  border: 2px solid #fbbf24;
  color: #ffffff;
}

/* 2. Right: Agents (Royal Blue) */
.node-agent {
  right: -19px;
  top: calc(50% - 19px);
  background: #2563eb;
  border: 2px solid #60a5fa;
  color: #ffffff;
}

/* 3. Bottom: Instructions (Cyan) */
.node-instruction {
  bottom: -19px;
  left: calc(50% - 19px);
  background: #0284c7;
  border: 2px solid #38bdf8;
  color: #ffffff;
}

/* 4. Left: Skills (Purple) */
.node-skill {
  left: -19px;
  top: calc(50% - 19px);
  background: #7c3aed;
  border: 2px solid #a855f7;
  color: #ffffff;
}

/* Keyframe Animations */
@keyframes logo-levitate {
  0%, 100% {
    transform: translateY(0px) rotate(0deg);
  }
  50% {
    transform: translateY(-10px) rotate(1.2deg);
  }
}

@keyframes aura-breathe {
  0%, 100% {
    transform: scale(0.95);
    opacity: 0.65;
  }
  50% {
    transform: scale(1.08);
    opacity: 0.95;
  }
}

@keyframes orbit-rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes orbit-counter-rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(-360deg);
  }
}

@keyframes cursor-blink {
  0%, 49% {
    opacity: 1;
  }
  50%, 100% {
    opacity: 0;
  }
}

@keyframes chevron-pulse {
  0%, 100% {
    filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.4));
  }
  50% {
    filter: drop-shadow(0 0 8px rgba(147, 197, 253, 0.9));
  }
}

@media (max-width: 640px) {
  .hero-logo-wrapper {
    max-width: 290px;
    height: 290px;
    transform: scale(0.82);
  }
}
</style>
