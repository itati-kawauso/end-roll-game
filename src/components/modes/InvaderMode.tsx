import React, { useEffect, useRef, useState } from 'react';
import { createCreditItem, CreditItem } from '../../data/creditsData';
import { sound } from '../../utils/audio';
import { ArrowLeft, Pause, Play, RotateCcw, Volume2, VolumeX, Shield, Zap, Film, Bomb } from 'lucide-react';

interface InvaderModeProps {
  onBackToMenu: () => void;
  onGameOver: (score: number, stats: { wave: number; defeated: number; bossesDefeated: number; shipLevel: number }) => void;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  isEnemy?: boolean;
  isHoming?: boolean;
  homingTimer?: number;
  isDrone?: boolean;
}

export interface CreditLetter {
  char: string;
  relX: number; // offset from row center
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  hitFlash: number;
  isAlive: boolean;
  isRole: boolean;
}

export interface EnemyCreditRow {
  id: string;
  x: number; // center X
  y: number; // top Y
  tier: number; // 1 to 5
  letters: CreditLetter[];
  item: CreditItem;
  totalWidth: number;
}

interface BossEnemy {
  name: string;
  subtitle: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  shootCooldown: number;
  phase: number;
  angle: number;
  enraged: boolean;
  shieldReels: Array<{ angle: number; dist: number }>;
}

interface ExpOrb {
  x: number;
  y: number;
  vy: number;
  value: number;
}

interface PowerUp {
  x: number;
  y: number;
  vy: number;
  type: 'shield' | 'life' | 'bomb' | 'drone';
  label?: string;
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

const TIER_COLORS = [
  { text: '#ffffff', bg: 'rgba(255, 255, 255, 0.08)', border: '#ffffff' }, // Tier 1: White
  { text: '#38bdf8', bg: 'rgba(56, 189, 248, 0.12)', border: '#38bdf8' }, // Tier 2: Cyan
  { text: '#fbbf24', bg: 'rgba(251, 191, 36, 0.15)', border: '#fbbf24' }, // Tier 3: Gold
  { text: '#f43f5e', bg: 'rgba(244, 63, 94, 0.15)', border: '#f43f5e' }, // Tier 4: Magenta/Pink
  { text: '#ef4444', bg: 'rgba(239, 68, 68, 0.2)', border: '#ef4444' }, // Tier 5: Crimson
];

export const InvaderMode: React.FC<InvaderModeProps> = ({ onBackToMenu, onGameOver }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [score, setScore] = useState<number>(0);
  const [lives, setLives] = useState<number>(3);
  const [wave, setWave] = useState<number>(1);
  const [shipLevel, setShipLevel] = useState<number>(1);
  const [exp, setExp] = useState<number>(0);
  const [expToNext, setExpToNext] = useState<number>(160);
  const [bombs, setBombs] = useState<number>(2);
  const [hasShield, setHasShield] = useState<boolean>(false);
  const [droneCount, setDroneCount] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(sound.isMuted());
  const [bossActive, setBossActive] = useState<boolean>(false);
  const [bossHpPercent, setBossHpPercent] = useState<number>(100);
  const [levelUpBanner, setLevelUpBanner] = useState<string | null>(null);

  // Input states
  const keysPressed = useRef<{ [key: string]: boolean }>({});
  const touchX = useRef<number | null>(null);
  const touchShoot = useRef<boolean>(false);

  // Decoupled Game State
  const gameState = useRef({
    running: true,
    paused: false,
    player: {
      x: 0,
      y: 0,
      width: 44,
      height: 32,
      vx: 0,
      lives: 3,
      shipLevel: 1, // 1 to 10+
      exp: 0,
      expToNext: 160,
      bombs: 2,
      hasShield: false,
      droneCount: 0, // 0 to 4 (Acquired ONLY by defeating bosses!)
      shootCooldown: 0,
      droneCooldown: 0,
      invulnTimer: 0,
      reelAngle: 0,
    },
    wave: 1,
    enemies: [] as EnemyCreditRow[],
    boss: null as BossEnemy | null,
    bullets: [] as Bullet[],
    enemyBullets: [] as Bullet[],
    expOrbs: [] as ExpOrb[],
    powerups: [] as PowerUp[],
    particles: [] as Particle[],
    spawnTimer: 0,
    waveKillCount: 0,
    totalDefeated: 0,
    bossesDefeated: 0,
    score: 0,
    cameraShake: 0,
  });

  useEffect(() => {
    sound.startCinemaBGM('invader');
    sound.startProjectorHum();
    return () => {
      sound.stopBGM();
      sound.stopProjectorHum();
    };
  }, []);

  const triggerBomb = () => {
    const player = gameState.current.player;
    if (player.bombs <= 0 || !gameState.current.running || gameState.current.paused) return;

    player.bombs--;
    setBombs(player.bombs);
    sound.playBomb();
    gameState.current.cameraShake = 24;

    // Clear all enemy bullets
    gameState.current.enemyBullets = [];

    // Deal heavy bomb damage to all active credit letters
    gameState.current.enemies.forEach((row) => {
      row.letters.forEach((l) => {
        if (l.isAlive) {
          l.hp -= 4;
          if (l.hp <= 0) {
            l.isAlive = false;
            gameState.current.score += row.tier * 40;
            gameState.current.totalDefeated++;
          }
        }
      });
    });

    // Deal massive damage to boss
    if (gameState.current.boss) {
      gameState.current.boss.hp -= 90;
      setBossHpPercent(Math.max(0, Math.round((gameState.current.boss.hp / gameState.current.boss.maxHp) * 100)));
    }

    setScore(gameState.current.score);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current[e.code] = true;
      if (e.code === 'KeyP' || e.code === 'Escape') {
        togglePause();
      }
      if (e.code === 'KeyB') {
        triggerBomb();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current[e.code] = false;
    };
    const handleBlur = () => {
      keysPressed.current = {};
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
        gameState.current.player.y = rect.height - 56;
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);

    const spawnExplosion = (x: number, y: number, count = 16, color = '#ffffff') => {
      for (let i = 0; i < count; i++) {
        const speed = Math.random() * 170 + 30;
        const angle = Math.random() * Math.PI * 2;
        gameState.current.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          alpha: 1.0,
          size: Math.random() * 4 + 2,
          color,
        });
      }
    };

    const spawnCreditRow = (screenW: number) => {
      const wave = gameState.current.wave;
      const tier = Math.min(Math.floor((wave - 1) / 2) + 1, 5);
      const item = createCreditItem();
      const letters: CreditLetter[] = [];
      const charW = 20;
      const charH = 24;

      if (item.isHeader) {
        const chars = item.name.split('');
        const totalW = chars.length * charW;
        chars.forEach((ch, idx) => {
          letters.push({
            char: ch,
            relX: -totalW / 2 + idx * charW + charW / 2,
            width: charW,
            height: charH,
            hp: tier,
            maxHp: tier,
            hitFlash: 0,
            isAlive: true,
            isRole: false,
          });
        });
      } else {
        const roleChars = item.role.split('');
        const nameChars = item.name.split('');
        const gap = 32;
        const roleW = roleChars.length * charW;
        const nameW = nameChars.length * charW;
        const totalW = roleW + gap + nameW;
        const startX = -totalW / 2;

        roleChars.forEach((ch, idx) => {
          letters.push({
            char: ch,
            relX: startX + idx * charW + charW / 2,
            width: charW,
            height: charH,
            hp: tier,
            maxHp: tier,
            hitFlash: 0,
            isAlive: true,
            isRole: true,
          });
        });

        const nameStartX = startX + roleW + gap;
        nameChars.forEach((ch, idx) => {
          letters.push({
            char: ch,
            relX: nameStartX + idx * charW + charW / 2,
            width: charW,
            height: charH,
            hp: tier,
            maxHp: tier,
            hitFlash: 0,
            isAlive: true,
            isRole: false,
          });
        });
      }

      const totalRowW = letters.length > 0 ? (letters[letters.length - 1].relX - letters[0].relX + charW) : 200;
      const rowX = screenW / 2 + (Math.random() * 80 - 40);

      gameState.current.enemies.push({
        id: item.id,
        x: rowX,
        y: -30,
        tier,
        letters,
        item,
        totalWidth: totalRowW,
      });
    };

    const spawnBoss = (screenW: number) => {
      sound.playBossWarning();
      gameState.current.cameraShake = 18;
      setBossActive(true);

      const bossList = [
        { name: "GIGA PICTURES", sub: "全米配給メガスタジオ", baseHp: 240 },
        { name: "NEO TOHO CINEMA", sub: "帝都フィルムコンツェルン", baseHp: 440 },
        { name: "CROWN WORLDWIDE", sub: "超巨神配給スタジオ", baseHp: 680 },
      ];
      const selected = bossList[(gameState.current.bossesDefeated) % bossList.length];
      const totalHp = selected.baseHp + gameState.current.bossesDefeated * 120;

      gameState.current.boss = {
        name: selected.name,
        subtitle: selected.sub,
        x: screenW / 2,
        y: 85,
        width: Math.min(screenW * 0.85, 360),
        height: 84,
        hp: totalHp,
        maxHp: totalHp,
        shootCooldown: 1.2,
        phase: 1,
        angle: 0,
        enraged: false,
        shieldReels: [
          { angle: 0, dist: 75 },
          { angle: Math.PI, dist: 75 },
        ],
      };
      setBossHpPercent(100);
    };

    // Process Player EXP Level up (Slower progression, higher ceiling up to Lv.10+)
    const gainExp = (amount: number) => {
      const p = gameState.current.player;
      p.exp += amount;

      if (p.exp >= p.expToNext) {
        p.exp -= p.expToNext;
        p.shipLevel++;
        // Slower progression: exponentially higher requirements
        p.expToNext = Math.floor(p.expToNext * 1.48);
        sound.playLevelUp();

        // Level up perks: Multi-beam spread & heavy firepower scaling
        if (p.shipLevel === 2) {
          setLevelUpBanner('LV.2: 2連装映写ビーム ＆ 連射速度UP！');
        } else if (p.shipLevel === 3) {
          setLevelUpBanner('LV.3: 3方向ワイドビーム 解放！');
        } else if (p.shipLevel === 4) {
          p.bombs = Math.min(5, p.bombs + 1);
          setLevelUpBanner('LV.4: 4連装ヘビーキャノン ＆ カチンコボム+1！');
        } else if (p.shipLevel === 5) {
          setLevelUpBanner('LV.5: 5WAYハイパー斉射ビーム！');
        } else if (p.shipLevel === 6) {
          setLevelUpBanner('LV.6: 6連装ヘキサパルスブラスター！');
        } else if (p.shipLevel === 7) {
          p.bombs = Math.min(5, p.bombs + 1);
          setLevelUpBanner('LV.7: 7WAYスプリーム拡散 ＆ ボム所持上限UP！');
        } else if (p.shipLevel === 8) {
          setLevelUpBanner('LV.8: 高威力ヘビープラズマ弾 換装！');
        } else if (p.shipLevel === 9) {
          p.bombs = Math.min(5, p.bombs + 1);
          setLevelUpBanner('LV.9: 9方向オーバードライブ・アーク！');
        } else {
          p.bombs = Math.min(5, p.bombs + 1);
          setLevelUpBanner(`LV.${p.shipLevel}: 極限ジェネシス・プロジェクター！`);
        }

        setShipLevel(p.shipLevel);
        setBombs(p.bombs);

        setTimeout(() => setLevelUpBanner(null), 3500);
      }

      setExp(p.exp);
      setExpToNext(p.expToNext);
    };

    const loop = (now: number) => {
      animId = requestAnimationFrame(loop);
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);

      if (gameState.current.paused || !gameState.current.running) return;

      const screenW = canvas.width / (Math.min(window.devicePixelRatio || 1, 2));
      const screenH = canvas.height / (Math.min(window.devicePixelRatio || 1, 2));
      const player = gameState.current.player;

      if (player.invulnTimer > 0) {
        player.invulnTimer -= dt;
      }

      player.reelAngle += dt * 8;

      // Player Movement
      const leftKey = keysPressed.current['KeyA'] || keysPressed.current['ArrowLeft'];
      const rightKey = keysPressed.current['KeyD'] || keysPressed.current['ArrowRight'];

      const moveSpeed = 330;
      if (touchX.current !== null) {
        const diff = touchX.current - player.x;
        player.x += Math.sign(diff) * Math.min(Math.abs(diff), moveSpeed * dt * 1.5);
      } else if (leftKey && !rightKey) {
        player.x -= moveSpeed * dt;
      } else if (rightKey && !leftKey) {
        player.x += moveSpeed * dt;
      }

      player.x = Math.max(player.width / 2 + 10, Math.min(screenW - player.width / 2 - 10, player.x));
      player.y = screenH - 52;

      // Shooting logic
      player.shootCooldown -= dt;
      player.droneCooldown -= dt;

      const spaceKey = keysPressed.current['Space'] || keysPressed.current['KeyW'] || keysPressed.current['ArrowUp'] || touchShoot.current;

      if ((spaceKey || true) && player.shootCooldown <= 0) {
        // Fire interval smoothly ramps with level
        const fireInterval = Math.max(0.08, 0.22 - player.shipLevel * 0.013);
        player.shootCooldown = fireInterval;
        sound.playLaser();

        const bulletSpeed = -660;

        // Broad upgrade ceiling up to Level 10+
        if (player.shipLevel === 1) {
          gameState.current.bullets.push({ x: player.x, y: player.y - 18, vx: 0, vy: bulletSpeed });
        } else if (player.shipLevel === 2) {
          gameState.current.bullets.push({ x: player.x - 10, y: player.y - 18, vx: 0, vy: bulletSpeed });
          gameState.current.bullets.push({ x: player.x + 10, y: player.y - 18, vx: 0, vy: bulletSpeed });
        } else if (player.shipLevel === 3) {
          gameState.current.bullets.push({ x: player.x, y: player.y - 18, vx: 0, vy: bulletSpeed });
          gameState.current.bullets.push({ x: player.x - 12, y: player.y - 16, vx: -100, vy: bulletSpeed });
          gameState.current.bullets.push({ x: player.x + 12, y: player.y - 16, vx: 100, vy: bulletSpeed });
        } else if (player.shipLevel === 4) {
          gameState.current.bullets.push({ x: player.x - 6, y: player.y - 18, vx: -30, vy: bulletSpeed });
          gameState.current.bullets.push({ x: player.x + 6, y: player.y - 18, vx: 30, vy: bulletSpeed });
          gameState.current.bullets.push({ x: player.x - 16, y: player.y - 16, vx: -120, vy: bulletSpeed });
          gameState.current.bullets.push({ x: player.x + 16, y: player.y - 16, vx: 120, vy: bulletSpeed });
        } else if (player.shipLevel === 5) {
          gameState.current.bullets.push({ x: player.x, y: player.y - 20, vx: 0, vy: bulletSpeed });
          gameState.current.bullets.push({ x: player.x - 10, y: player.y - 18, vx: -70, vy: bulletSpeed });
          gameState.current.bullets.push({ x: player.x + 10, y: player.y - 18, vx: 70, vy: bulletSpeed });
          gameState.current.bullets.push({ x: player.x - 20, y: player.y - 15, vx: -160, vy: bulletSpeed });
          gameState.current.bullets.push({ x: player.x + 20, y: player.y - 15, vx: 160, vy: bulletSpeed });
        } else if (player.shipLevel === 6) {
          gameState.current.bullets.push({ x: player.x - 5, y: player.y - 18, vx: -25, vy: bulletSpeed });
          gameState.current.bullets.push({ x: player.x + 5, y: player.y - 18, vx: 25, vy: bulletSpeed });
          gameState.current.bullets.push({ x: player.x - 14, y: player.y - 17, vx: -90, vy: bulletSpeed });
          gameState.current.bullets.push({ x: player.x + 14, y: player.y - 17, vx: 90, vy: bulletSpeed });
          gameState.current.bullets.push({ x: player.x - 24, y: player.y - 15, vx: -180, vy: bulletSpeed });
          gameState.current.bullets.push({ x: player.x + 24, y: player.y - 15, vx: 180, vy: bulletSpeed });
        } else if (player.shipLevel === 7 || player.shipLevel === 8) {
          gameState.current.bullets.push({ x: player.x, y: player.y - 20, vx: 0, vy: bulletSpeed });
          gameState.current.bullets.push({ x: player.x - 9, y: player.y - 18, vx: -60, vy: bulletSpeed });
          gameState.current.bullets.push({ x: player.x + 9, y: player.y - 18, vx: 60, vy: bulletSpeed });
          gameState.current.bullets.push({ x: player.x - 18, y: player.y - 16, vx: -130, vy: bulletSpeed });
          gameState.current.bullets.push({ x: player.x + 18, y: player.y - 16, vx: 130, vy: bulletSpeed });
          gameState.current.bullets.push({ x: player.x - 28, y: player.y - 14, vx: -210, vy: bulletSpeed });
          gameState.current.bullets.push({ x: player.x + 28, y: player.y - 14, vx: 210, vy: bulletSpeed });
        } else {
          // Ship Level 9+ (9-Way Overdrive Arc)
          gameState.current.bullets.push({ x: player.x, y: player.y - 20, vx: 0, vy: bulletSpeed });
          gameState.current.bullets.push({ x: player.x - 8, y: player.y - 19, vx: -50, vy: bulletSpeed });
          gameState.current.bullets.push({ x: player.x + 8, y: player.y - 19, vx: 50, vy: bulletSpeed });
          gameState.current.bullets.push({ x: player.x - 16, y: player.y - 17, vx: -110, vy: bulletSpeed });
          gameState.current.bullets.push({ x: player.x + 16, y: player.y - 17, vx: 110, vy: bulletSpeed });
          gameState.current.bullets.push({ x: player.x - 24, y: player.y - 15, vx: -180, vy: bulletSpeed });
          gameState.current.bullets.push({ x: player.x + 24, y: player.y - 15, vx: 180, vy: bulletSpeed });
          gameState.current.bullets.push({ x: player.x - 32, y: player.y - 13, vx: -260, vy: bulletSpeed });
          gameState.current.bullets.push({ x: player.x + 32, y: player.y - 13, vx: 260, vy: bulletSpeed });
        }
      }

      // Satellite Drone support lasers (Up to 4 drones obtained ONLY by defeating bosses!)
      if (player.droneCount > 0 && player.droneCooldown <= 0) {
        player.droneCooldown = 0.2;
        if (player.droneCount >= 1) {
          gameState.current.bullets.push({ x: player.x - 28, y: player.y + 2, vx: 0, vy: -680, isDrone: true });
        }
        if (player.droneCount >= 2) {
          gameState.current.bullets.push({ x: player.x + 28, y: player.y + 2, vx: 0, vy: -680, isDrone: true });
        }
        if (player.droneCount >= 3) {
          gameState.current.bullets.push({ x: player.x - 44, y: player.y + 10, vx: -50, vy: -680, isDrone: true });
        }
        if (player.droneCount >= 4) {
          gameState.current.bullets.push({ x: player.x + 44, y: player.y + 10, vx: 50, vy: -680, isDrone: true });
        }
      }

      // Update Bullets (One hit per bullet, NO piercing)
      gameState.current.bullets.forEach((b) => {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      });
      gameState.current.bullets = gameState.current.bullets.filter((b) => b.y > -20 && b.x > 0 && b.x < screenW);

      // Update Enemy Bullets (including Revenge Homing Bullets!)
      gameState.current.enemyBullets.forEach((eb) => {
        if (eb.isHoming && eb.homingTimer && eb.homingTimer > 0) {
          eb.homingTimer -= dt;
          const targetAngle = Math.atan2(player.y - eb.y, player.x - eb.x);
          const currentAngle = Math.atan2(eb.vy, eb.vx);
          let diff = targetAngle - currentAngle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const steerSpeed = 2.6;
          const newAngle = currentAngle + Math.sign(diff) * Math.min(Math.abs(diff), steerSpeed * dt);
          const spd = 205;
          eb.vx = Math.cos(newAngle) * spd;
          eb.vy = Math.sin(newAngle) * spd;
        }

        eb.x += eb.vx * dt;
        eb.y += eb.vy * dt;

        const dist = Math.hypot(eb.x - player.x, eb.y - player.y);
        if (dist < 20 && player.invulnTimer <= 0) {
          eb.y = screenH + 100;
          handlePlayerHit();
        }
      });
      gameState.current.enemyBullets = gameState.current.enemyBullets.filter((b) => b.y < screenH + 20 && b.y > -20 && b.x > -20 && b.x < screenW + 20);

      // Enemy spawning (when no boss)
      if (!gameState.current.boss) {
        gameState.current.spawnTimer += dt;
        const spawnInterval = Math.max(0.75, 1.8 - gameState.current.wave * 0.1);
        if (gameState.current.spawnTimer > spawnInterval) {
          gameState.current.spawnTimer = 0;
          spawnCreditRow(screenW);
        }

        if (gameState.current.waveKillCount >= 14 && gameState.current.wave % 3 === 0) {
          spawnBoss(screenW);
        }
      }

      const fallSpeed = 38 + gameState.current.wave * 7;

      // Update Credit Rows (Letter Hitboxes & Toothless gaps)
      gameState.current.enemies.forEach((row) => {
        row.y += fallSpeed * dt;

        let anyLetterReachedBottom = false;
        let anyLetterHitPlayer = false;

        row.letters.forEach((l) => {
          if (!l.isAlive) return;

          if (l.hitFlash > 0) l.hitFlash -= dt * 6;

          const letterAbsX = row.x + l.relX;
          const letterAbsY = row.y;

          if (letterAbsY + l.height >= screenH - 24) {
            anyLetterReachedBottom = true;
          }

          if (
            player.invulnTimer <= 0 &&
            Math.abs(letterAbsX - player.x) < (l.width / 2 + player.width / 2) &&
            Math.abs(letterAbsY + l.height / 2 - player.y) < 22
          ) {
            anyLetterHitPlayer = true;
          }

          // Bullet vs Letter (NO PIERCING: bullet consumed immediately upon hitting 1 letter!)
          gameState.current.bullets.forEach((bullet) => {
            if (bullet.y < 0) return;

            const withinX = Math.abs(bullet.x - letterAbsX) <= (l.width / 2 + 2);
            const withinY = bullet.y >= letterAbsY - 4 && bullet.y <= letterAbsY + l.height + 4;

            if (withinX && withinY) {
              bullet.y = -100;

              l.hp--;
              l.hitFlash = 1.0;
              sound.playHit();
              spawnExplosion(letterAbsX, letterAbsY + l.height / 2, 4, TIER_COLORS[row.tier - 1].border);

              if (l.hp <= 0) {
                l.isAlive = false;
                sound.playExplosion();
                spawnExplosion(letterAbsX, letterAbsY + l.height / 2, 10, TIER_COLORS[row.tier - 1].border);

                const letterPoints = row.tier * 40;
                gameState.current.score += letterPoints;
                gameState.current.totalDefeated++;
                setScore(gameState.current.score);

                // REVENGE BULLET
                const revengeChance = Math.min(0.28, 0.12 + gameState.current.wave * 0.025);
                if (Math.random() < revengeChance) {
                  const angle = Math.atan2(player.y - letterAbsY, player.x - letterAbsX);
                  const speed = 195;
                  gameState.current.enemyBullets.push({
                    x: letterAbsX,
                    y: letterAbsY + l.height / 2,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    isEnemy: true,
                    isHoming: true,
                    homingTimer: 1.3,
                  });
                }

                // EXP DROP: Lower probability (10%) for slower, more measured level progression
                if (Math.random() < 0.10) {
                  gameState.current.expOrbs.push({
                    x: letterAbsX,
                    y: letterAbsY,
                    vy: 95,
                    value: 15 * row.tier,
                  });
                }

                // Rare powerup drop
                if (Math.random() < 0.035) {
                  const types: Array<'shield' | 'life' | 'bomb'> = ['shield', 'bomb'];
                  if (player.lives < 3) types.push('life');
                  gameState.current.powerups.push({
                    x: letterAbsX,
                    y: letterAbsY,
                    vy: 80,
                    type: types[Math.floor(Math.random() * types.length)],
                  });
                }
              }
            }
          });
        });

        if (anyLetterReachedBottom || anyLetterHitPlayer) {
          row.letters.forEach((l) => {
            if (l.isAlive) {
              spawnExplosion(row.x + l.relX, row.y + l.height / 2, 8, '#ef4444');
              l.isAlive = false;
            }
          });
          sound.playExplosion();
          handlePlayerHit();
        }

        const remainingAlive = row.letters.filter((l) => l.isAlive).length;
        if (remainingAlive === 0) {
          gameState.current.waveKillCount++;
          gameState.current.score += 200 * row.tier;

          // Row wipe bonus EXP (35% probability)
          if (Math.random() < 0.35) {
            gameState.current.expOrbs.push({
              x: row.x,
              y: row.y,
              vy: 95,
              value: 30 * row.tier,
            });
          }
          setScore(gameState.current.score);

          if (gameState.current.waveKillCount >= 16 && !gameState.current.boss) {
            gameState.current.wave++;
            gameState.current.waveKillCount = 0;
            setWave(gameState.current.wave);
          }
        }
      });

      gameState.current.enemies = gameState.current.enemies.filter((row) => {
        return row.letters.some((l) => l.isAlive) && row.y < screenH + 30;
      });

      // Update EXP Orbs: Falling straight down (no suction)
      gameState.current.expOrbs.forEach((orb) => {
        orb.y += orb.vy * dt;

        const dist = Math.hypot(player.x - orb.x, player.y - orb.y);
        if (dist < 26) {
          orb.y = screenH + 100;
          sound.playExpPickup();
          gainExp(orb.value);
        }
      });
      gameState.current.expOrbs = gameState.current.expOrbs.filter((o) => o.y < screenH + 20);

      // Update Boss
      const boss = gameState.current.boss;
      if (boss) {
        boss.angle += dt * (boss.enraged ? 2.5 : 1.4);

        if (boss.hp < boss.maxHp * 0.25) {
          boss.enraged = true;
          boss.x = screenW / 2 + Math.sin(boss.angle * 1.2) * (screenW * 0.35);
          boss.y = 80 + Math.cos(boss.angle * 2.4) * 20;
        } else {
          boss.x = screenW / 2 + Math.sin(boss.angle * 0.8) * (screenW * 0.28);
        }

        boss.shieldReels.forEach((sr) => {
          sr.angle += dt * 3.0;
        });

        boss.shootCooldown -= dt;

        if (boss.shootCooldown <= 0) {
          boss.shootCooldown = boss.enraged ? 0.45 : Math.max(0.65, 1.3 - gameState.current.bossesDefeated * 0.12);
          sound.playLaser();

          const dx = player.x - boss.x;
          const dy = player.y - (boss.y + 30);
          const angle = Math.atan2(dy, dx);
          const bSpeed = boss.enraged ? 260 : 210;

          gameState.current.enemyBullets.push({
            x: boss.x,
            y: boss.y + 35,
            vx: Math.cos(angle) * bSpeed,
            vy: Math.sin(angle) * bSpeed,
            isEnemy: true,
          });

          const spreadAngles = boss.enraged ? [-0.4, -0.2, 0.2, 0.4] : [-0.3, 0.3];
          spreadAngles.forEach((sa) => {
            gameState.current.enemyBullets.push({
              x: boss.x + Math.sin(sa) * 60,
              y: boss.y + 25,
              vx: Math.cos(angle + sa) * bSpeed,
              vy: Math.sin(angle + sa) * bSpeed,
              isEnemy: true,
            });
          });
        }

        if (boss.hp < boss.maxHp * 0.7) {
          gameState.current.bullets.forEach((bullet) => {
            if (bullet.y < 0) return;
            boss.shieldReels.forEach((sr) => {
              const sx = boss.x + Math.cos(sr.angle) * sr.dist;
              const sy = boss.y + Math.sin(sr.angle) * 35;
              const dist = Math.hypot(bullet.x - sx, bullet.y - sy);
              if (dist < 18) {
                bullet.y = -100;
                sound.playHit();
                spawnExplosion(sx, sy, 4, '#fbbf24');
              }
            });
          });
        }

        gameState.current.bullets.forEach((bullet) => {
          if (
            bullet.x >= boss.x - boss.width / 2 &&
            bullet.x <= boss.x + boss.width / 2 &&
            bullet.y >= boss.y - boss.height / 2 &&
            bullet.y <= boss.y + boss.height / 2
          ) {
            bullet.y = -100;
            boss.hp--;
            sound.playHit();
            spawnExplosion(bullet.x, bullet.y, 4, boss.enraged ? '#ef4444' : '#fbbf24');
            setBossHpPercent(Math.max(0, Math.round((boss.hp / boss.maxHp) * 100)));

            if (boss.hp <= 0) {
              // BOSS DEFEATED!
              sound.playExplosion();
              sound.playVictory();
              spawnExplosion(boss.x, boss.y, 60, '#fbbf24');
              spawnExplosion(boss.x - 50, boss.y - 20, 40, '#f59e0b');
              spawnExplosion(boss.x + 50, boss.y + 20, 40, '#ef4444');

              gameState.current.bossesDefeated++;
              gameState.current.score += 4500;
              setScore(gameState.current.score);

              // BOSS DEFEAT REWARD: Drops the special SATELLITE DRONE CORE item!
              gameState.current.powerups.push({
                x: boss.x,
                y: boss.y,
                vy: 65,
                type: 'drone',
                label: '子機',
              });

              // Also drops life or bomb
              if (player.lives < 3) {
                gameState.current.powerups.push({
                  x: boss.x - 40,
                  y: boss.y + 10,
                  vy: 75,
                  type: 'life',
                });
              } else {
                gameState.current.powerups.push({
                  x: boss.x - 40,
                  y: boss.y + 10,
                  vy: 75,
                  type: 'bomb',
                });
              }

              gainExp(450);

              gameState.current.boss = null;
              setBossActive(false);
              gameState.current.wave++;
              gameState.current.waveKillCount = 0;
              setWave(gameState.current.wave);
            }
          }
        });
      }

      // Update Powerups (including Boss-Exclusive Drone drop)
      gameState.current.powerups.forEach((pu) => {
        pu.y += pu.vy * dt;
        const dist = Math.hypot(pu.x - player.x, pu.y - player.y);
        if (dist < 34) {
          pu.y = screenH + 100;
          sound.playPowerup();
          spawnExplosion(pu.x, pu.y, 16, '#c084fc');

          if (pu.type === 'drone') {
            // Satellite Drone acquired!
            player.droneCount = Math.min(4, player.droneCount + 1);
            setDroneCount(player.droneCount);
            setLevelUpBanner(`★ サテライト子機(映写ドローン x${player.droneCount}) 獲得！ ★`);
            setTimeout(() => setLevelUpBanner(null), 3800);
          } else if (pu.type === 'bomb') {
            player.bombs = Math.min(5, player.bombs + 1);
            setBombs(player.bombs);
          } else if (pu.type === 'shield') {
            player.hasShield = true;
            setHasShield(true);
          } else if (pu.type === 'life') {
            if (player.lives < 3) {
              player.lives++;
              setLives(player.lives);
            }
          }
          gameState.current.score += 400;
          setScore(gameState.current.score);
        }
      });
      gameState.current.powerups = gameState.current.powerups.filter((p) => p.y < screenH + 20);

      // Update Particles
      gameState.current.particles.forEach((p) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.alpha -= dt * 2.0;
      });
      gameState.current.particles = gameState.current.particles.filter((p) => p.alpha > 0);

      if (gameState.current.cameraShake > 0) {
        gameState.current.cameraShake = Math.max(0, gameState.current.cameraShake - dt * 24);
      }

      // RENDER
      ctx.fillStyle = '#060608';
      ctx.fillRect(0, 0, screenW, screenH);

      ctx.save();
      if (gameState.current.cameraShake > 0) {
        const sx = (Math.random() - 0.5) * gameState.current.cameraShake;
        const sy = (Math.random() - 0.5) * gameState.current.cameraShake;
        ctx.translate(sx, sy);
      }

      // Cinematic Projector Beam background
      const beamGrad = ctx.createRadialGradient(player.x, player.y, 10, player.x, 0, screenH);
      beamGrad.addColorStop(0, 'rgba(56, 189, 248, 0.08)');
      beamGrad.addColorStop(0.8, 'rgba(255, 255, 255, 0.01)');
      beamGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = beamGrad;
      ctx.fillRect(0, 0, screenW, screenH);

      // Draw Enemies (Toothless Credit Lines)
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      gameState.current.enemies.forEach((row) => {
        const style = TIER_COLORS[row.tier - 1];

        row.letters.forEach((l) => {
          if (!l.isAlive) return;

          const letterX = row.x + l.relX;
          const letterY = row.y;

          ctx.fillStyle = l.hitFlash > 0 ? '#ffffff' : style.bg;
          ctx.fillRect(letterX - l.width / 2, letterY, l.width, l.height);

          ctx.strokeStyle = style.border;
          ctx.lineWidth = 1;
          ctx.strokeRect(letterX - l.width / 2, letterY, l.width, l.height);

          ctx.font = l.isRole
            ? '12px "Zen Kaku Gothic New", sans-serif'
            : 'bold 13px "Zen Kaku Gothic New", sans-serif';

          ctx.fillStyle = l.hitFlash > 0 ? '#000000' : l.isRole ? '#9ca3af' : style.text;
          ctx.fillText(l.char, letterX, letterY + l.height / 2);

          if (l.maxHp > 1) {
            const dotW = 3;
            const startDotX = letterX - (l.maxHp * (dotW + 1)) / 2;
            for (let h = 0; h < l.maxHp; h++) {
              ctx.fillStyle = h < l.hp ? style.border : 'rgba(255, 255, 255, 0.2)';
              ctx.fillRect(startDotX + h * (dotW + 1), letterY + l.height - 3, dotW, 2);
            }
          }
        });
      });

      // Draw EXP Orbs in the EXACT same badge style as Life and Bomb!
      gameState.current.expOrbs.forEach((orb) => {
        ctx.save();
        ctx.translate(orb.x, orb.y);

        // Circular badge bubble like Life & Bomb
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#fbbf24';
        ctx.font = '900 9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('EXP', 0, 0);

        ctx.restore();
      });

      // Draw Boss
      if (boss) {
        ctx.save();
        ctx.translate(boss.x, boss.y);

        ctx.fillStyle = boss.enraged ? 'rgba(40, 10, 10, 0.95)' : 'rgba(20, 16, 5, 0.9)';
        ctx.fillRect(-boss.width / 2, -boss.height / 2, boss.width, boss.height);

        ctx.strokeStyle = boss.enraged ? '#ef4444' : '#fbbf24';
        ctx.lineWidth = 3;
        ctx.strokeRect(-boss.width / 2, -boss.height / 2, boss.width, boss.height);

        ctx.strokeStyle = boss.enraged ? '#f87171' : '#f59e0b';
        ctx.lineWidth = 1;
        ctx.strokeRect(-boss.width / 2 + 4, -boss.height / 2 + 4, boss.width - 8, boss.height - 8);

        ctx.font = '900 18px "Cinzel", serif';
        ctx.fillStyle = boss.enraged ? '#fca5a5' : '#fef08a';
        ctx.fillText(boss.name, 0, -8);

        ctx.font = '11px "Noto Serif JP", serif';
        ctx.fillStyle = boss.enraged ? '#ef4444' : '#fbbf24';
        ctx.fillText(`【 ${boss.subtitle} 】${boss.enraged ? ' [OVERDRIVE]' : ''}`, 0, 16);

        if (boss.hp < boss.maxHp * 0.7) {
          boss.shieldReels.forEach((sr) => {
            const rx = Math.cos(sr.angle) * sr.dist;
            const ry = Math.sin(sr.angle) * 35;
            ctx.fillStyle = '#374151';
            ctx.beginPath();
            ctx.arc(rx, ry, 12, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = '#fbbf24';
            ctx.font = '9px monospace';
            ctx.fillText('SHIELD', rx, ry);
          });
        }

        ctx.restore();
      }

      // Draw Powerups (Life, Bomb, Shield, and Special Boss Drone Core!)
      gameState.current.powerups.forEach((pu) => {
        ctx.save();
        ctx.translate(pu.x, pu.y);

        if (pu.type === 'drone') {
          // Special Flashy Boss Drop: SATELLITE DRONE CORE!
          const pulse = Math.sin(now * 0.008) * 4;

          // Glowing aura
          ctx.strokeStyle = 'rgba(192, 132, 252, 0.4)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, 20 + pulse, 0, Math.PI * 2);
          ctx.stroke();

          // Capsule badge
          ctx.fillStyle = 'rgba(24, 10, 40, 0.9)';
          ctx.beginPath();
          ctx.arc(0, 0, 15, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#c084fc';
          ctx.lineWidth = 2.5;
          ctx.stroke();

          ctx.fillStyle = '#f3e8ff';
          ctx.font = 'bold 10px "Zen Kaku Gothic New", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('子機', 0, 0);

          // Indicator banner above
          ctx.font = '900 8px monospace';
          ctx.fillStyle = '#c084fc';
          ctx.fillText('▼ DRONE ITEM', 0, -22);
        } else {
          // Standard arcade capsule badges (Shield, Life, Bomb)
          let iconColor = '#38bdf8';
          let label = 'W';
          if (pu.type === 'shield') {
            iconColor = '#10b981';
            label = 'S';
          } else if (pu.type === 'life') {
            iconColor = '#f43f5e';
            label = '♥';
          } else if (pu.type === 'bomb') {
            iconColor = '#f97316';
            label = 'B';
          }

          ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
          ctx.beginPath();
          ctx.arc(0, 0, 12, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = iconColor;
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = iconColor;
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, 0, 0);
        }

        ctx.restore();
      });

      // Draw Player Bullets
      ctx.fillStyle = '#38bdf8';
      gameState.current.bullets.forEach((b) => {
        if (b.isDrone) {
          ctx.fillStyle = '#c084fc';
          ctx.fillRect(b.x - 1.5, b.y, 3, 12);
        } else {
          ctx.fillStyle = player.shipLevel >= 8 ? '#f59e0b' : '#38bdf8';
          ctx.fillRect(b.x - 2, b.y, 4, 15);
        }
      });

      // Draw Enemy Bullets
      gameState.current.enemyBullets.forEach((eb) => {
        if (eb.isHoming) {
          ctx.save();
          ctx.translate(eb.x, eb.y);
          ctx.fillStyle = '#f43f5e';
          ctx.beginPath();
          ctx.moveTo(0, -6);
          ctx.lineTo(5, 0);
          ctx.lineTo(0, 6);
          ctx.lineTo(-5, 0);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = '#fef08a';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, 0, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(eb.x, eb.y, 4, 0, Math.PI * 2);
          ctx.fill();
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

      // Draw Player Ship & Satellite Option Drones
      if (player.invulnTimer <= 0 || Math.floor(now / 80) % 2 === 0) {
        drawProjectorShip(ctx, player.x, player.y, player.reelAngle, player.hasShield, player.droneCount);
      }

      // Defense boundary line
      ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
      ctx.fillRect(0, screenH - 18, screenW, 2);

      ctx.restore();
    };

    const handlePlayerHit = () => {
      const player = gameState.current.player;

      if (player.hasShield) {
        player.hasShield = false;
        setHasShield(false);
        sound.playHit();
        gameState.current.cameraShake = 8;
        player.invulnTimer = 1.5;
        return;
      }

      player.lives--;
      setLives(player.lives);
      sound.playExplosion();
      gameState.current.cameraShake = 16;
      player.invulnTimer = 2.2;

      if (player.lives <= 0) {
        gameState.current.running = false;
        sound.playGameOver();
        onGameOver(gameState.current.score, {
          wave: gameState.current.wave,
          defeated: gameState.current.totalDefeated,
          bossesDefeated: gameState.current.bossesDefeated,
          shipLevel: player.shipLevel,
        });
      }
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);

  const drawProjectorShip = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    reelAngle: number,
    hasShield: boolean,
    drones: number
  ) => {
    ctx.save();
    ctx.translate(x, y);

    if (hasShield) {
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(16, 185, 129, 0.1)';
      ctx.fill();
    }

    ctx.fillStyle = '#262626';
    ctx.fillRect(-18, -4, 36, 18);
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-18, -4, 36, 18);

    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(-6, -14, 12, 10);
    ctx.strokeRect(-6, -14, 12, 10);

    const drawReel = (rx: number, ry: number) => {
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(reelAngle);

      ctx.fillStyle = '#171717';
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 4; i++) {
        const rad = (i * Math.PI) / 2;
        ctx.beginPath();
        ctx.arc(Math.cos(rad) * 5, Math.sin(rad) * 5, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    drawReel(-14, -12);
    drawReel(14, -12);

    // Draw up to 4 Satellite Option Drones (obtained only from Bosses!)
    const drawDrone = (dx: number, dy: number) => {
      ctx.save();
      ctx.translate(dx, dy);
      ctx.fillStyle = '#3b0764';
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#c084fc';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    if (drones >= 1) drawDrone(-28, 4);
    if (drones >= 2) drawDrone(28, 4);
    if (drones >= 3) drawDrone(-44, 12);
    if (drones >= 4) drawDrone(44, 12);

    ctx.restore();
  };

  const expPercent = Math.min(100, Math.round((exp / expToNext) * 100));

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black select-none overflow-hidden"
      onTouchMove={(e) => {
        if (e.touches.length > 0) {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) touchX.current = e.touches[0].clientX - rect.left;
        }
      }}
      onTouchEnd={() => {
        touchX.current = null;
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

      {/* Low Occlusion HUD */}
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
          >
            {isPaused ? <Play className="w-4 h-4 text-emerald-400" /> : <Pause className="w-4 h-4" />}
          </button>
          <button
            onClick={toggleSound}
            className="p-1.5 bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 rounded border border-neutral-700 transition"
          >
            {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>

        {/* Center Mode Title & Wave */}
        <div className="text-center">
          <div className="text-[10px] tracking-widest text-neutral-400 uppercase font-cinzel">Credits Invader Hard</div>
          <div className="text-xs font-bold text-neutral-200">
            WAVE {wave} {bossActive && <span className="text-rose-400 font-black ml-1 animate-pulse">· MEGA BOSS ATTACK!</span>}
          </div>
        </div>

        {/* Right Stats: Score, Lives & Bomb Button */}
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
          <div className="pointer-events-auto">
            <button
              onClick={triggerBomb}
              disabled={bombs <= 0}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold border transition ${
                bombs > 0
                  ? 'bg-rose-600/80 hover:bg-rose-500 text-white border-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.5)]'
                  : 'bg-neutral-800 text-neutral-500 border-neutral-700 opacity-50'
              }`}
              title="カチンコ・メガボム発動 (Bキー)"
            >
              <Bomb className="w-3.5 h-3.5" />
              <span>BOMB x{bombs}</span>
            </button>
          </div>
        </div>
      </div>

      {/* EXP Progress Gauge Bar */}
      <div className="absolute top-12 inset-x-8 max-w-sm mx-auto pointer-events-none z-20">
        <div className="flex justify-between items-center text-[10px] text-neutral-400 mb-0.5 font-mono">
          <span className="text-cyan-400 font-bold">SHIP LV.{shipLevel}</span>
          <span>EXP: {exp} / {expToNext}</span>
        </div>
        <div className="w-full h-1.5 bg-neutral-900 border border-neutral-800 rounded-full overflow-hidden p-0.5">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full transition-all duration-150"
            style={{ width: `${expPercent}%` }}
          />
        </div>
      </div>

      {/* Level Up Banner Notification */}
      {levelUpBanner && (
        <div className="absolute top-20 inset-x-0 mx-auto max-w-xs text-center z-30 pointer-events-none animate-bounce">
          <div className="py-1 px-4 bg-gradient-to-r from-amber-500 to-amber-600 text-neutral-950 font-black text-xs rounded-full shadow-lg border border-amber-300 inline-block">
            {levelUpBanner}
          </div>
        </div>
      )}

      {/* Boss Health Bar Overlay */}
      {bossActive && (
        <div className="absolute top-16 inset-x-8 max-w-md mx-auto pointer-events-none z-20">
          <div className="flex justify-between items-center text-[11px] mb-1">
            <span className="font-bold text-amber-400 tracking-wider font-cinzel">DISTRIBUTOR BOSS</span>
            <span className="font-mono text-neutral-300">{bossHpPercent}%</span>
          </div>
          <div className="w-full h-2.5 bg-neutral-900 border border-amber-500/50 rounded-full overflow-hidden p-0.5">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-rose-500 rounded-full transition-all duration-100"
              style={{ width: `${bossHpPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Sub-bar Weapon Stats & Control Hints */}
      <div className="absolute bottom-2 inset-x-0 flex justify-center items-center gap-4 pointer-events-none text-[11px] text-neutral-500 z-10 hidden sm:flex">
        <span>[A / D] 移動</span>
        <span>·</span>
        <span>[B] カチンコボム</span>
        <span>·</span>
        <span className="text-cyan-400 font-mono">LV.{shipLevel}</span>
        {droneCount > 0 && <span className="text-purple-400 font-mono">子機x{droneCount}</span>}
        {hasShield && <span className="text-emerald-400 font-bold">🛡️ シールド展開</span>}
        <span className="text-rose-400 font-bold">⚠️ 死に際誘導弾に警戒！</span>
      </div>

      {/* Mobile Touch Bar */}
      <div className="absolute bottom-4 inset-x-4 flex justify-between items-center sm:hidden pointer-events-none z-30">
        <div className="text-xs text-neutral-400 bg-neutral-900/80 px-3 py-1.5 rounded border border-neutral-800">
          左右スライドで移動
        </div>
        <button
          onClick={triggerBomb}
          disabled={bombs <= 0}
          className="pointer-events-auto px-4 py-2 bg-rose-600 text-white font-bold rounded-full text-xs shadow-lg active:scale-95"
        >
          BOMB ({bombs})
        </button>
      </div>

      {/* Pause Modal */}
      {isPaused && (
        <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-neutral-900 border border-neutral-700 p-6 rounded-lg text-center max-w-xs w-full shadow-2xl">
            <h3 className="text-xl font-bold font-serif-jp text-white mb-2">上映一時停止</h3>
            <p className="text-xs text-neutral-400 mb-6">インベーダー戦闘休止中</p>
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
