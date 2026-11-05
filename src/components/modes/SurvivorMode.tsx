import React, { useEffect, useRef, useState } from 'react';
import { createCreditItem, CreditItem, getRandomName } from '../../data/creditsData';
import { sound } from '../../utils/audio';
import { ArrowLeft, Pause, Play, RotateCcw, Volume2, VolumeX, Sparkles, Film, Zap, Heart, AlertTriangle } from 'lucide-react';

interface SurvivorModeProps {
  onBackToMenu: () => void;
  onGameOver: (score: number, stats: { time: number; jumps: number; stars: number; trapsSurvived: number }) => void;
}

export type GimmickType =
  | 'normal'
  | 'damage'        // 💥 特殊効果・爆破NG (ダメージ＆ノックバック)
  | 'heal'          // ❤️ ケータリング (ライフ1回復)
  | 'speed_surge'   // ⚡ 制作激走 (一定時間エンドロール超高速化＆制御不能スリップ)
  | 'rocket_boost'  // ▲ ワイヤー急浮上 (天井圧迫帯へ向けて強制大ロケットジャンプ)
  | 'crumble'       // 👻 幻覚削除カット (乗ると0.45秒で足場崩壊消滅)
  | 'moving';       // ↔️ ドリー移動 (左右に反復横移動する足場)

interface Platform {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  item: CreditItem;
  gimmick: GimmickType;
  gimmickLabel: string;
  gimmickColor: string;
  starCollected?: boolean;
  hasStar?: boolean;
  crumbleTimer?: number; // starts counting down when stepped on
  isCrumbled?: boolean;
  movingDir?: number;
  movingSpeed?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  size: number;
  color: string;
}

export const SurvivorMode: React.FC<SurvivorModeProps> = ({ onBackToMenu, onGameOver }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [score, setScore] = useState<number>(0);
  const [survivalTime, setSurvivalTime] = useState<number>(0);
  const [starsCount, setStarsCount] = useState<number>(0);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1.0);
  const [lives, setLives] = useState<number>(3);
  const [isSurging, setIsSurging] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(sound.isMuted());

  // Input states
  const keysPressed = useRef<{ [key: string]: boolean }>({});
  const touchLeft = useRef<boolean>(false);
  const touchRight = useRef<boolean>(false);
  const touchJump = useRef<boolean>(false);

  // References to keep game loop 60fps decoupled from React state
  const gameState = useRef({
    running: true,
    paused: false,
    player: {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      width: 20,
      height: 38,
      lives: 3,
      invulnTimer: 0,
      isGrounded: false,
      jumpsLeft: 2,
      facing: 1, // 1 right, -1 left
      runAnimFrame: 0,
      coyoteTimer: 0,
    },
    scrollSpeed: 88, // Starting base speed (faster than before!)
    speedSurgeTimer: 0, // For uncontrollable rush gimmick
    platforms: [] as Platform[],
    particles: [] as Particle[],
    lastSpawnY: 0,
    score: 0,
    time: 0,
    jumpCount: 0,
    starsCollected: 0,
    trapsSurvived: 0,
    cameraShake: 0,
    combo: 0,
    lastPlatformId: '',
  });

  useEffect(() => {
    sound.startCinemaBGM('survivor');
    sound.startProjectorHum();
    return () => {
      sound.stopBGM();
      sound.stopProjectorHum();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current[e.code] = true;
      if (e.code === 'KeyP' || e.code === 'Escape') {
        togglePause();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current[e.code] = false;
    };
    const handleBlur = () => {
      keysPressed.current = {};
      touchLeft.current = false;
      touchRight.current = false;
      touchJump.current = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const togglePause = () => {
    setIsPaused((prev) => {
      const next = !prev;
      gameState.current.paused = next;
      return next;
    });
  };

  const toggleSound = () => {
    const nextMuted = sound.toggleMute();
    setMuted(nextMuted);
  };

  // Helper to create a gimmick platform
  const createGimmickPlatform = (x: number, y: number, width: number): Platform => {
    const roll = Math.random();
    let gimmick: GimmickType = 'normal';
    let gimmickLabel = '';
    let gimmickColor = '#ffffff';

    if (roll < 0.18) {
      gimmick = 'damage';
      gimmickLabel = '💥 爆発NGトラップ';
      gimmickColor = '#ef4444';
    } else if (roll < 0.28) {
      gimmick = 'rocket_boost';
      gimmickLabel = '▲ ワイヤー急上昇';
      gimmickColor = '#f97316';
    } else if (roll < 0.38) {
      gimmick = 'speed_surge';
      gimmickLabel = '⚡ 制作猛ダッシュ';
      gimmickColor = '#eab308';
    } else if (roll < 0.48) {
      gimmick = 'crumble';
      gimmickLabel = '👻 幻覚カット(崩落)';
      gimmickColor = '#c084fc';
    } else if (roll < 0.58) {
      gimmick = 'moving';
      gimmickLabel = '↔️ ドリー移動撮影';
      gimmickColor = '#38bdf8';
    } else if (roll < 0.68) {
      gimmick = 'heal';
      gimmickLabel = '❤️ ロケ弁ケータリング';
      gimmickColor = '#10b981';
    }

    const item = createCreditItem();
    // Customise role based on gimmick for cinematic flavor
    if (gimmick === 'damage') {
      item.role = '特殊効果(誤爆発)';
    } else if (gimmick === 'heal') {
      item.role = 'ケータリング特製弁当';
    } else if (gimmick === 'rocket_boost') {
      item.role = 'ワイヤースタント急浮上';
    } else if (gimmick === 'speed_surge') {
      item.role = '制作進行(納期激走)';
    } else if (gimmick === 'crumble') {
      item.role = '未公開幻覚カット';
    } else if (gimmick === 'moving') {
      item.role = '移動特機ステディカム';
    }

    return {
      id: item.id,
      x,
      y,
      width,
      height: 24,
      item,
      gimmick,
      gimmickLabel,
      gimmickColor,
      hasStar: gimmick === 'normal' && Math.random() < 0.3,
      movingDir: Math.random() < 0.5 ? 1 : -1,
      movingSpeed: Math.random() * 60 + 50,
    };
  };

  // Main game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animId: number;
    let lastTime = performance.now();

    const updateDimensions = () => {
      if (!containerRef.current || !canvas) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      if (gameState.current.player.x === 0) {
        gameState.current.player.x = rect.width / 2;
        gameState.current.player.y = rect.height * 0.55;
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);

    // Initial platforms setup
    const rect = containerRef.current!.getBoundingClientRect();
    const platforms: Platform[] = [];
    const spacing = 70;
    let currY = rect.height * 0.2;

    while (currY < rect.height + 200) {
      const textWidth = Math.min(rect.width * 0.65, 340);
      const platX = (rect.width - textWidth) / 2 + (Math.random() * 80 - 40);
      platforms.push(createGimmickPlatform(platX, currY, textWidth));
      currY += spacing;
    }
    gameState.current.platforms = platforms;
    gameState.current.lastSpawnY = currY - spacing;

    const spawnDust = (x: number, y: number, count = 6, color = '#ffffff') => {
      for (let i = 0; i < count; i++) {
        gameState.current.particles.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 80,
          vy: -Math.random() * 50 - 10,
          alpha: 0.85,
          size: Math.random() * 3 + 1,
          color,
        });
      }
    };

    let jumpWasPressed = false;

    // Loop
    const loop = (now: number) => {
      animId = requestAnimationFrame(loop);
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);

      if (gameState.current.paused || !gameState.current.running) return;

      const screenW = canvas.width / (Math.min(window.devicePixelRatio || 1, 2));
      const screenH = canvas.height / (Math.min(window.devicePixelRatio || 1, 2));
      const player = gameState.current.player;

      gameState.current.time += dt;

      // Update Invulnerability
      if (player.invulnTimer > 0) {
        player.invulnTimer -= dt;
      }

      // Update Speed Surge Timer
      if (gameState.current.speedSurgeTimer > 0) {
        gameState.current.speedSurgeTimer -= dt;
        setIsSurging(true);
      } else {
        setIsSurging(false);
      }

      // RAPID SPEED RAMP: Ramps up significantly faster!
      // Base speed starts at 88, ramps with + time * 5.2 (reaches 350+ fast)
      // Extra surge boost if active (+160 px/s)
      const baseRampedSpeed = gameState.current.scrollSpeed + Math.min(gameState.current.time * 5.2, 280);
      const currentSpeed = baseRampedSpeed + (gameState.current.speedSurgeTimer > 0 ? 160 : 0);

      setSpeedMultiplier(Number((currentSpeed / 88).toFixed(1)));
      setSurvivalTime(Math.floor(gameState.current.time));

      // Controls
      const leftKey = keysPressed.current['KeyA'] || keysPressed.current['ArrowLeft'] || touchLeft.current;
      const rightKey = keysPressed.current['KeyD'] || keysPressed.current['ArrowRight'] || touchRight.current;
      const jumpKey = keysPressed.current['Space'] || keysPressed.current['KeyW'] || keysPressed.current['ArrowUp'] || touchJump.current;

      // When speed surging, horizontal control is slippery & hyper-speed (control difficult!)
      const isSurge = gameState.current.speedSurgeTimer > 0;
      const moveSpeed = isSurge ? 440 : 250;

      if (leftKey && !rightKey) {
        player.vx = isSurge ? player.vx * 0.92 - 40 : -moveSpeed;
        player.facing = -1;
        player.runAnimFrame += dt * (isSurge ? 20 : 12);
      } else if (rightKey && !leftKey) {
        player.vx = isSurge ? player.vx * 0.92 + 40 : moveSpeed;
        player.facing = 1;
        player.runAnimFrame += dt * (isSurge ? 20 : 12);
      } else {
        // Friction
        player.vx *= Math.pow(isSurge ? 0.05 : 0.0008, dt);
      }

      // Clamp horizontal speed
      const maxVx = isSurge ? 480 : 280;
      player.vx = Math.max(-maxVx, Math.min(maxVx, player.vx));

      // Jump edge detection
      if (jumpKey && !jumpWasPressed) {
        if (player.isGrounded || player.coyoteTimer > 0) {
          player.vy = -430;
          player.isGrounded = false;
          player.coyoteTimer = 0;
          player.jumpsLeft = 1;
          gameState.current.jumpCount++;
          sound.playJump();
          spawnDust(player.x, player.y + player.height / 2, 8);
        } else if (player.jumpsLeft > 0) {
          // Double Jump
          player.vy = -390;
          player.jumpsLeft--;
          gameState.current.jumpCount++;
          sound.playDoubleJump();
          spawnDust(player.x, player.y + player.height / 2, 12, '#38bdf8');
        }
      }
      jumpWasPressed = jumpKey;

      // Update horizontal position
      player.x += player.vx * dt;
      if (player.x < 16) player.x = 16;
      if (player.x > screenW - 16) player.x = screenW - 16;

      // Move platforms upwards with credits roll
      const upwardDelta = currentSpeed * dt;
      player.coyoteTimer = Math.max(0, player.coyoteTimer - dt);

      // Move and update platforms
      gameState.current.platforms.forEach((plat) => {
        plat.y -= upwardDelta;

        // Moving platform behavior
        if (plat.gimmick === 'moving' && plat.movingDir && plat.movingSpeed) {
          plat.x += plat.movingDir * plat.movingSpeed * dt;
          if (plat.x < 20) {
            plat.x = 20;
            plat.movingDir = 1;
          } else if (plat.x + plat.width > screenW - 20) {
            plat.x = screenW - 20 - plat.width;
            plat.movingDir = -1;
          }
        }

        // Crumble platform countdown
        if (plat.crumbleTimer !== undefined && plat.crumbleTimer > 0) {
          plat.crumbleTimer -= dt;
          if (plat.crumbleTimer <= 0) {
            plat.isCrumbled = true;
            sound.playExplosion();
            spawnDust(plat.x + plat.width / 2, plat.y, 20, '#c084fc');
          }
        }
      });

      // Filter out vanished crumbled platforms
      gameState.current.platforms = gameState.current.platforms.filter((p) => !p.isCrumbled);

      // Physics Swept Continuous Collision Check
      const prevY = player.y;
      const prevBottom = prevY + player.height / 2;

      const gravity = 890;
      player.vy += gravity * dt;

      let newY = player.y + player.vy * dt;
      let newBottom = newY + player.height / 2;

      let landedPlatform: Platform | null = null;
      let landedTopY = 0;

      for (const plat of gameState.current.platforms) {
        if (plat.isCrumbled) continue;

        const platTop = plat.y + 10;
        const platLeft = plat.x - 4;
        const platRight = plat.x + plat.width + 4;

        const isHorizontallyAligned =
          player.x + player.width / 2 > platLeft &&
          player.x - player.width / 2 < platRight;

        if (isHorizontallyAligned) {
          const sweptPassesThrough = prevBottom <= platTop + 7 && newBottom >= platTop - 4;
          const isFallingOrMovingWithPlat = player.vy >= -upwardDelta - 12;

          if (sweptPassesThrough && isFallingOrMovingWithPlat) {
            landedPlatform = plat;
            landedTopY = platTop;
            break;
          }
        }
      }

      if (landedPlatform) {
        newY = landedTopY - player.height / 2;
        player.vy = 0;
        player.isGrounded = true;
        player.jumpsLeft = 2;
        player.coyoteTimer = 0.12;

        // If moving platform, carry player along horizontally!
        if (landedPlatform.gimmick === 'moving' && landedPlatform.movingDir && landedPlatform.movingSpeed) {
          player.x += landedPlatform.movingDir * landedPlatform.movingSpeed * dt;
        }

        // Trigger Gimmick Effect on new landing!
        if (gameState.current.lastPlatformId !== landedPlatform.id) {
          gameState.current.lastPlatformId = landedPlatform.id;
          gameState.current.combo++;
          gameState.current.score += 60 + gameState.current.combo * 15;

          const gim = landedPlatform.gimmick;

          if (gim === 'damage') {
            // 💥 Damage trap platform!
            if (player.invulnTimer <= 0) {
              player.lives--;
              setLives(player.lives);
              player.invulnTimer = 1.4;
              player.vy = -260; // Knockback bounce
              gameState.current.cameraShake = 16;
              sound.playTrapDamage();
              spawnDust(player.x, landedTopY, 16, '#ef4444');

              if (player.lives <= 0) {
                triggerGameOver('DEFEATED_BY_TRAPS');
                return;
              }
            }
          } else if (gim === 'heal') {
            // ❤️ Heal platform!
            if (player.lives < 3) {
              player.lives++;
              setLives(player.lives);
            }
            sound.playHeal();
            spawnDust(player.x, landedTopY, 18, '#10b981');
            gameState.current.score += 250;
          } else if (gim === 'rocket_boost') {
            // ▲ Rocket upward launch: Danger of getting crushed at ceiling!
            player.vy = -740;
            player.isGrounded = false;
            sound.playRocketBoost();
            gameState.current.cameraShake = 8;
            spawnDust(player.x, landedTopY, 22, '#f97316');
          } else if (gim === 'speed_surge') {
            // ⚡ Rush / speed surge: whole credits surge upwards & player slips!
            gameState.current.speedSurgeTimer = 3.6;
            sound.playPowerup();
            gameState.current.cameraShake = 10;
            spawnDust(player.x, landedTopY, 18, '#eab308');
          } else if (gim === 'crumble') {
            // 👻 Crumbling platform countdown started!
            if (landedPlatform.crumbleTimer === undefined) {
              landedPlatform.crumbleTimer = 0.45;
              sound.playHit();
            }
          } else {
            // Normal landing
            sound.playLand();
            spawnDust(player.x, landedTopY, 6, '#ffffff');
          }
        }

        // Star collectible check
        if (landedPlatform.hasStar && !landedPlatform.starCollected) {
          landedPlatform.starCollected = true;
          gameState.current.starsCollected++;
          gameState.current.score += 300;
          setStarsCount(gameState.current.starsCollected);
          sound.playPowerup();
          spawnDust(landedPlatform.x + landedPlatform.width / 2, landedPlatform.y - 10, 15, '#fbbf24');
        }
      } else {
        player.isGrounded = false;
      }

      player.y = newY;

      // Add base passive score
      gameState.current.score += Math.floor(dt * 35);
      setScore(gameState.current.score);

      // Spawn new platforms at bottom
      const lowestY = Math.max(...gameState.current.platforms.map((p) => p.y));
      if (lowestY < screenH + 80) {
        const textWidth = Math.min(screenW * 0.7, 340);
        const platX = (screenW - textWidth) / 2 + (Math.random() * 80 - 40);
        gameState.current.platforms.push(
          createGimmickPlatform(platX, lowestY + 68 + Math.random() * 15, textWidth)
        );
      }

      // Cull platforms scrolled above top
      gameState.current.platforms = gameState.current.platforms.filter((p) => p.y > -80);

      // Update particles
      gameState.current.particles.forEach((p) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.alpha -= dt * 1.6;
      });
      gameState.current.particles = gameState.current.particles.filter((p) => p.alpha > 0);

      // Camera shake decay
      if (gameState.current.cameraShake > 0) {
        gameState.current.cameraShake = Math.max(0, gameState.current.cameraShake - dt * 25);
      }

      // Check Fail Conditions:
      // 1. Touched Top Danger Ceiling
      const topCrushZone = 44;
      if (player.y - player.height / 2 <= topCrushZone) {
        triggerGameOver('CRUSHED_AT_TOP');
        return;
      }

      // 2. Fallen off the Bottom Screen
      const bottomVoid = screenH - 10;
      if (player.y - player.height / 2 >= bottomVoid) {
        triggerGameOver('FELL_OFF_SCREEN');
        return;
      }

      // RENDER
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, screenW, screenH);

      ctx.save();
      if (gameState.current.cameraShake > 0) {
        const sx = (Math.random() - 0.5) * gameState.current.cameraShake;
        const sy = (Math.random() - 0.5) * gameState.current.cameraShake;
        ctx.translate(sx, sy);
      }

      // Projector beam cone
      const beamGrad = ctx.createRadialGradient(
        screenW / 2, -20, 20,
        screenW / 2, screenH / 2, screenH
      );
      beamGrad.addColorStop(0, isSurge ? 'rgba(234, 179, 8, 0.12)' : 'rgba(255, 255, 255, 0.08)');
      beamGrad.addColorStop(0.7, 'rgba(255, 255, 255, 0.015)');
      beamGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = beamGrad;
      ctx.fillRect(0, 0, screenW, screenH);

      // Sprocket holes
      ctx.fillStyle = '#111111';
      for (let sy = -20 + (gameState.current.time * currentSpeed) % 40; sy < screenH; sy += 36) {
        ctx.fillRect(4, sy, 8, 18);
        ctx.fillRect(screenW - 12, sy, 8, 18);
      }

      // Draw Platforms (The Credit Lines & Gimmicks)
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      gameState.current.platforms.forEach((plat) => {
        const gim = plat.gimmick;
        const isCrumb = plat.crumbleTimer !== undefined;

        // Solid footing baseline
        ctx.fillStyle = gim === 'normal' ? 'rgba(255, 255, 255, 0.45)' : plat.gimmickColor;
        if (isCrumb) {
          // Vibrating crumble effect
          const vib = (Math.random() - 0.5) * 4;
          ctx.fillRect(plat.x + vib, plat.y + 10, plat.width, 2.5);
        } else {
          ctx.fillRect(plat.x, plat.y + 10, plat.width, 2.5);
        }

        // Platform End Caps
        ctx.fillStyle = plat.gimmickColor;
        ctx.fillRect(plat.x, plat.y + 7, 3, 6);
        ctx.fillRect(plat.x + plat.width - 3, plat.y + 7, 3, 6);

        // Gimmick Label Tag
        if (plat.gimmickLabel) {
          ctx.font = 'bold 10px monospace';
          ctx.fillStyle = plat.gimmickColor;
          ctx.textAlign = 'left';
          ctx.fillText(plat.gimmickLabel, plat.x, plat.y - 14);
        }

        // Credit Text
        ctx.font = '13px "Zen Kaku Gothic New", sans-serif';
        ctx.fillStyle = gim === 'normal' ? '#9ca3af' : plat.gimmickColor;
        ctx.textAlign = 'right';
        ctx.fillText(plat.item.role, plat.x + plat.width * 0.44, plat.y);

        ctx.font = '600 15px "Zen Kaku Gothic New", sans-serif';
        ctx.fillStyle = '#f3f4f6';
        ctx.textAlign = 'left';
        ctx.fillText(plat.item.name, plat.x + plat.width * 0.52, plat.y);

        // Star Collectible
        if (plat.hasStar && !plat.starCollected) {
          const starX = plat.x + plat.width / 2;
          const starY = plat.y - 24 + Math.sin(gameState.current.time * 6) * 4;

          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.arc(starX, starY, 7, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#fef08a';
          ctx.beginPath();
          ctx.arc(starX - 2, starY - 2, 3, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });

      // Draw Particles
      gameState.current.particles.forEach((p) => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1.0;

      // Draw Pictogram Stickman Player (blinking when invulnerable)
      if (player.invulnTimer <= 0 || Math.floor(now / 80) % 2 === 0) {
        drawPictogramPlayer(ctx, player, gameState.current.time);
      }

      // Draw Top Danger Crush Zone Warning Bar
      const warnPulse = Math.sin(gameState.current.time * 9) * 0.25 + 0.75;
      ctx.fillStyle = `rgba(239, 68, 68, ${0.18 * warnPulse})`;
      ctx.fillRect(0, 0, screenW, topCrushZone);

      ctx.fillStyle = '#ef4444';
      ctx.fillRect(0, topCrushZone - 2, screenW, 2);

      // Hazard stripes
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
      ctx.lineWidth = 4;
      for (let hx = 0; hx < screenW; hx += 24) {
        ctx.beginPath();
        ctx.moveTo(hx, 0);
        ctx.lineTo(hx + 12, topCrushZone - 2);
        ctx.stroke();
      }

      ctx.font = '900 11px monospace';
      ctx.fillStyle = '#ef4444';
      ctx.textAlign = 'center';
      ctx.fillText('▲ CRUSH ZONE / 圧迫危険区域 ▲', screenW / 2, 18);

      // Draw Bottom Danger Void
      ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
      ctx.fillRect(0, screenH - 12, screenW, 12);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(0, screenH - 2, screenW, 2);

      ctx.restore();
    };

    const triggerGameOver = (reason: 'CRUSHED_AT_TOP' | 'FELL_OFF_SCREEN' | 'DEFEATED_BY_TRAPS') => {
      gameState.current.running = false;
      sound.playExplosion();
      sound.playGameOver();
      onGameOver(gameState.current.score, {
        time: Math.floor(gameState.current.time),
        jumps: gameState.current.jumpCount,
        stars: gameState.current.starsCollected,
        trapsSurvived: gameState.current.trapsSurvived,
      });
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);

  const drawPictogramPlayer = (
    ctx: CanvasRenderingContext2D,
    player: { x: number; y: number; facing: number; isGrounded: boolean; runAnimFrame: number },
    time: number
  ) => {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.scale(player.facing, 1);

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Head
    const headRadius = 5.5;
    const headY = -14;
    ctx.beginPath();
    ctx.arc(0, headY, headRadius, 0, Math.PI * 2);
    ctx.fill();

    // Torso
    const shoulderY = headY + headRadius + 1;
    const hipY = 5;
    ctx.beginPath();
    ctx.moveTo(0, shoulderY);
    ctx.lineTo(0, hipY);
    ctx.stroke();

    if (!player.isGrounded) {
      // Jumping
      ctx.beginPath();
      ctx.moveTo(0, shoulderY + 2);
      ctx.lineTo(7, -8);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, shoulderY + 2);
      ctx.lineTo(-7, -4);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, hipY);
      ctx.lineTo(6, 12);
      ctx.lineTo(8, 17);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, hipY);
      ctx.lineTo(-5, 11);
      ctx.lineTo(-3, 16);
      ctx.stroke();
    } else {
      // Running / Idle
      const isMoving = Math.abs(gameState.current.player.vx) > 10;
      if (isMoving) {
        const legSwing = Math.sin(player.runAnimFrame) * 10;
        const armSwing = Math.cos(player.runAnimFrame) * 8;

        ctx.beginPath();
        ctx.moveTo(0, shoulderY + 2);
        ctx.lineTo(armSwing, shoulderY + 8);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, shoulderY + 2);
        ctx.lineTo(-armSwing, shoulderY + 8);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, hipY);
        ctx.lineTo(legSwing, 12);
        ctx.lineTo(legSwing * 1.2, 19);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, hipY);
        ctx.lineTo(-legSwing, 12);
        ctx.lineTo(-legSwing * 1.2, 19);
        ctx.stroke();
      } else {
        const breath = Math.sin(time * 3) * 0.8;
        ctx.beginPath();
        ctx.moveTo(0, shoulderY + 2);
        ctx.lineTo(5, 7 + breath);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, shoulderY + 2);
        ctx.lineTo(-5, 7 + breath);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, hipY);
        ctx.lineTo(4, 19);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, hipY);
        ctx.lineTo(-4, 19);
        ctx.stroke();
      }
    }

    ctx.restore();
  };

  return (
    <div ref={containerRef} className="relative w-full h-full bg-black select-none overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

      {/* Low-Occlusion HUD Overlay */}
      <div className="absolute top-0 inset-x-0 p-3 flex justify-between items-center pointer-events-none z-20">
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={onBackToMenu}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900/80 hover:bg-neutral-800 text-xs text-neutral-300 rounded border border-neutral-700 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>メニュー</span>
          </button>
          <button
            onClick={togglePause}
            className="p-1.5 bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 rounded border border-neutral-700 transition"
            title="一時停止"
          >
            {isPaused ? <Play className="w-4 h-4 text-emerald-400" /> : <Pause className="w-4 h-4" />}
          </button>
          <button
            onClick={toggleSound}
            className="p-1.5 bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 rounded border border-neutral-700 transition"
            title="音量ミュート切替"
          >
            {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>

        {/* Center Mode Title & Surge Banner */}
        <div className="text-center">
          <div className="text-[10px] tracking-widest text-neutral-400 uppercase font-cinzel">Credit Climber Hard</div>
          <div className="text-xs font-bold text-neutral-200">
            {isSurging ? (
              <span className="text-amber-400 font-black animate-pulse flex items-center justify-center gap-1">
                <Zap className="w-3.5 h-3.5" />
                ⚡ 制作激走・超加速暴走中！ [制御困難]
              </span>
            ) : (
              'クレジット・サバイバー (ギミック猛威編)'
            )}
          </div>
        </div>

        {/* Right Stats Cluster: Score, Time, Lives & Speed */}
        <div className="flex items-center gap-4 text-right">
          <div>
            <div className="text-[10px] text-neutral-400 tracking-wider">SCORE</div>
            <div className="font-mono text-base font-bold text-amber-300 tabular-nums">{score}</div>
          </div>
          <div>
            <div className="text-[10px] text-neutral-400 tracking-wider">LIVES</div>
            <div className="flex items-center gap-1 mt-0.5 justify-end">
              {[1, 2, 3].map((idx) => (
                <Film
                  key={idx}
                  className={`w-4 h-4 ${idx <= lives ? 'text-amber-400 fill-amber-400/30' : 'text-neutral-700'}`}
                />
              ))}
            </div>
          </div>
          <div className="hidden sm:block">
            <div className="text-[10px] text-neutral-400 tracking-wider">SPEED</div>
            <div className={`font-mono text-sm font-bold tabular-nums ${isSurging ? 'text-amber-400 animate-pulse' : 'text-cyan-400'}`}>
              {speedMultiplier}x
            </div>
          </div>
        </div>
      </div>

      {/* Sub-bar Hints & Gimmick Legend */}
      <div className="absolute bottom-2 inset-x-0 flex justify-center items-center gap-3 pointer-events-none text-[10px] text-neutral-400 z-10 hidden sm:flex bg-black/60 py-1 border-t border-neutral-900">
        <span className="text-rose-400">💥 爆破NG(痛)</span>
        <span>·</span>
        <span className="text-emerald-400">❤️ 弁当(回復)</span>
        <span>·</span>
        <span className="text-amber-400">⚡ 激走(超加速暴走)</span>
        <span>·</span>
        <span className="text-orange-400">▲ 急浮上(天井注意)</span>
        <span>·</span>
        <span className="text-purple-400">👻 幻覚(即崩壊)</span>
        <span>·</span>
        <span className="text-sky-400">↔️ ドリー(横移動)</span>
      </div>

      {/* On-Screen Mobile Touch Controls */}
      <div className="absolute bottom-4 inset-x-4 flex justify-between items-end pointer-events-none sm:hidden z-30">
        <div className="flex gap-2 pointer-events-auto">
          <button
            onTouchStart={() => (touchLeft.current = true)}
            onTouchEnd={() => (touchLeft.current = false)}
            onMouseDown={() => (touchLeft.current = true)}
            onMouseUp={() => (touchLeft.current = false)}
            className="w-14 h-14 bg-neutral-800/80 active:bg-neutral-700 rounded-full border border-neutral-600 text-lg flex items-center justify-center text-white"
          >
            ◀
          </button>
          <button
            onTouchStart={() => (touchRight.current = true)}
            onTouchEnd={() => (touchRight.current = false)}
            onMouseDown={() => (touchRight.current = true)}
            onMouseUp={() => (touchRight.current = false)}
            className="w-14 h-14 bg-neutral-800/80 active:bg-neutral-700 rounded-full border border-neutral-600 text-lg flex items-center justify-center text-white"
          >
            ▶
          </button>
        </div>
        <div className="pointer-events-auto">
          <button
            onTouchStart={() => (touchJump.current = true)}
            onTouchEnd={() => (touchJump.current = false)}
            onMouseDown={() => (touchJump.current = true)}
            onMouseUp={() => (touchJump.current = false)}
            className="w-16 h-16 bg-amber-500/80 active:bg-amber-600 rounded-full border border-amber-300 text-sm font-bold flex items-center justify-center text-black shadow-lg"
          >
            JUMP
          </button>
        </div>
      </div>

      {/* Pause Modal */}
      {isPaused && (
        <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-neutral-900 border border-neutral-700 p-6 rounded-lg text-center max-w-xs w-full shadow-2xl">
            <h3 className="text-xl font-bold font-serif-jp text-white mb-2">上映一時停止</h3>
            <p className="text-xs text-neutral-400 mb-6">高難度サバイバル休止中</p>
            <div className="flex flex-col gap-3">
              <button
                onClick={togglePause}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold rounded text-sm transition"
              >
                再開する
              </button>
              <button
                onClick={onBackToMenu}
                className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-sm border border-neutral-600 transition"
              >
                タイトルに戻る
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
