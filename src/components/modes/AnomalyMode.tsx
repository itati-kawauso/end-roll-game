import React, { useEffect, useRef, useState } from 'react';
import { createCreditItem, CreditItem } from '../../data/creditsData';
import { sound } from '../../utils/audio';
import { ArrowLeft, Pause, Play, Volume2, VolumeX, AlertTriangle, Search, CheckCircle2 } from 'lucide-react';

interface AnomalyModeProps {
  onBackToMenu: () => void;
  onGameOver: (score: number, stats: { caught: number; missed: number; maxCombo: number }) => void;
}

interface ScrollingCredit {
  id: string;
  y: number;
  item: CreditItem;
  detected: boolean;
  missed: boolean;
  flashTimer: number;
}

interface FeedbackStamp {
  id: string;
  x: number;
  y: number;
  text: string;
  type: 'correct' | 'wrong' | 'miss';
  alpha: number;
}

export const AnomalyMode: React.FC<AnomalyModeProps> = ({ onBackToMenu, onGameOver }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [score, setScore] = useState<number>(0);
  const [strikes, setStrikes] = useState<number>(0); // 0 to 3
  const [combo, setCombo] = useState<number>(0);
  const [caughtCount, setCaughtCount] = useState<number>(0);
  const [level, setLevel] = useState<number>(1);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(sound.isMuted());
  const [recentLog, setRecentLog] = useState<string>('エンドロール内の違和感（文字化け・怪しい役職・長すぎる名前等）を指摘せよ');

  // Input states
  const mousePos = useRef<{ x: number; y: number }>({ x: -100, y: -100 });
  const hoveredCreditId = useRef<string | null>(null);

  // Decoupled Game State
  const gameState = useRef({
    running: true,
    paused: false,
    credits: [] as ScrollingCredit[],
    stamps: [] as FeedbackStamp[],
    strikes: 0,
    score: 0,
    caught: 0,
    missed: 0,
    combo: 0,
    maxCombo: 0,
    level: 1,
    scrollSpeed: 52, // smooth readability
    lastSpawnY: 0,
    cameraShake: 0,
    falseAlarmCooldown: 0,
    totalTime: 0,
  });

  useEffect(() => {
    sound.startCinemaBGM('anomaly');
    sound.startProjectorHum();
    return () => {
      sound.stopBGM();
      sound.stopProjectorHum();
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
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);

    // Initial batch of credits
    const rect = containerRef.current!.getBoundingClientRect();
    const credits: ScrollingCredit[] = [];
    const spacing = 58;
    let currY = rect.height * 0.3;

    let counter = 0;
    while (currY < rect.height + 400) {
      counter++;
      const isAnomaly = counter > 2 && (counter % 5 === 0 || Math.random() < 0.22);
      const item = createCreditItem(isAnomaly);
      credits.push({
        id: item.id,
        y: currY,
        item,
        detected: false,
        missed: false,
        flashTimer: 0,
      });
      currY += spacing;
    }
    gameState.current.credits = credits;
    gameState.current.lastSpawnY = currY - spacing;

    // The Game Loop
    const loop = (now: number) => {
      animId = requestAnimationFrame(loop);
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);

      if (gameState.current.paused || !gameState.current.running) return;

      const screenW = canvas.width / (Math.min(window.devicePixelRatio || 1, 2));
      const screenH = canvas.height / (Math.min(window.devicePixelRatio || 1, 2));

      gameState.current.totalTime += dt;
      if (gameState.current.falseAlarmCooldown > 0) {
        gameState.current.falseAlarmCooldown -= dt;
      }

      // Scrolling speed ramps smoothly with level
      const currentSpeed = gameState.current.scrollSpeed + (gameState.current.level - 1) * 7;

      // Update Credits positions
      let currentHovered: string | null = null;
      const topEscapeThreshold = 36;

      gameState.current.credits.forEach((cred) => {
        cred.y -= currentSpeed * dt;

        if (cred.flashTimer > 0) {
          cred.flashTimer -= dt * 4;
        }

        // Hover detection box around text
        const boxH = 46;
        if (
          mousePos.current.y >= cred.y - boxH / 2 &&
          mousePos.current.y <= cred.y + boxH / 2 &&
          mousePos.current.x >= 20 &&
          mousePos.current.x <= screenW - 20
        ) {
          currentHovered = cred.id;
        }

        // Check if an unspotted anomaly scrolled past the top threshold!
        if (cred.item.isAnomaly && !cred.detected && !cred.missed && cred.y < topEscapeThreshold) {
          cred.missed = true;
          handleAnomalyMissed(cred, screenW);
        }
      });

      hoveredCreditId.current = currentHovered;

      // Spawn new credits at bottom
      const lowestY = Math.max(...gameState.current.credits.map((c) => c.y));
      if (lowestY < screenH + 120) {
        counter++;
        const isAnomaly = counter % 6 === 0 || Math.random() < 0.24;
        const item = createCreditItem(isAnomaly);
        gameState.current.credits.push({
          id: item.id,
          y: lowestY + 58,
          item,
          detected: false,
          missed: false,
          flashTimer: 0,
        });
      }

      // Filter out credits that scrolled completely past view
      gameState.current.credits = gameState.current.credits.filter((c) => c.y > -80);

      // Update feedback stamps
      gameState.current.stamps.forEach((s) => {
        s.y -= 25 * dt;
        s.alpha -= dt * 0.9;
      });
      gameState.current.stamps = gameState.current.stamps.filter((s) => s.alpha > 0);

      // Camera shake decay
      if (gameState.current.cameraShake > 0) {
        gameState.current.cameraShake = Math.max(0, gameState.current.cameraShake - dt * 25);
      }

      // RENDER
      ctx.fillStyle = '#060607';
      ctx.fillRect(0, 0, screenW, screenH);

      ctx.save();
      if (gameState.current.cameraShake > 0) {
        const sx = (Math.random() - 0.5) * gameState.current.cameraShake;
        const sy = (Math.random() - 0.5) * gameState.current.cameraShake;
        ctx.translate(sx, sy);
      }

      // Subtle projector light beam center glow
      const beamGrad = ctx.createRadialGradient(
        screenW / 2, -50, 40,
        screenW / 2, screenH / 2, screenH * 0.9
      );
      beamGrad.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
      beamGrad.addColorStop(0.7, 'rgba(255, 255, 255, 0.01)');
      beamGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = beamGrad;
      ctx.fillRect(0, 0, screenW, screenH);

      // Top Red Threshold Bar (Exit Line)
      ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
      ctx.fillRect(0, 0, screenW, topEscapeThreshold);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(0, topEscapeThreshold - 2, screenW, 2);

      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = '#ef4444';
      ctx.textAlign = 'center';
      ctx.fillText('▲ LIMIT LINE / ここを通過すると見逃し判定 ▲', screenW / 2, 22);

      // Draw Credits Stream
      gameState.current.credits.forEach((cred) => {
        const isHovered = hoveredCreditId.current === cred.id;
        const item = cred.item;

        ctx.save();

        // If hovered, draw subtle spotlight highlight box
        if (isHovered && !cred.detected && !cred.missed) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
          ctx.fillRect(screenW * 0.1, cred.y - 18, screenW * 0.8, 36);

          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1;
          ctx.strokeRect(screenW * 0.1, cred.y - 18, screenW * 0.8, 36);

          // Reticle brackets on corners
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          const rx = screenW * 0.1;
          const rw = screenW * 0.8;
          const ry = cred.y - 18;
          const rh = 36;
          const bl = 8;
          // TL
          ctx.beginPath(); ctx.moveTo(rx, ry + bl); ctx.lineTo(rx, ry); ctx.lineTo(rx + bl, ry); ctx.stroke();
          // TR
          ctx.beginPath(); ctx.moveTo(rx + rw - bl, ry); ctx.lineTo(rx + rw, ry); ctx.lineTo(rx + rw, ry + bl); ctx.stroke();
          // BL
          ctx.beginPath(); ctx.moveTo(rx, ry + rh - bl); ctx.lineTo(rx, ry + rh); ctx.lineTo(rx + bl, ry + rh); ctx.stroke();
          // BR
          ctx.beginPath(); ctx.moveTo(rx + rw - bl, ry + rh); ctx.lineTo(rx + rw, ry + rh); ctx.lineTo(rx + rw, ry + rh - bl); ctx.stroke();

          // Action prompt tag
          ctx.font = '900 10px monospace';
          ctx.fillStyle = '#38bdf8';
          ctx.textAlign = 'right';
          ctx.fillText('[ クリックで指摘 ]', rx + rw - 12, ry - 4);
        }

        // If already detected successfully
        if (cred.detected) {
          ctx.fillStyle = 'rgba(16, 185, 129, 0.1)';
          ctx.fillRect(screenW * 0.1, cred.y - 18, screenW * 0.8, 36);
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(screenW * 0.1, cred.y - 18, screenW * 0.8, 36);
        }

        // Render Anomalies special text effects:
        let customFontRole = '14px "Zen Kaku Gothic New", sans-serif';
        let customFontName = '600 15px "Zen Kaku Gothic New", sans-serif';
        let customTextColor: string | null = null;

        if (item.isAnomaly && !cred.detected) {
          if (item.anomalyType === 'flipped') {
            // Upside down text
            ctx.translate(screenW / 2, cred.y);
            ctx.rotate(Math.PI);
            ctx.translate(-screenW / 2, -cred.y);
          } else if (item.anomalyType === 'mirrored') {
            // Mirrored text
            ctx.translate(screenW / 2, 0);
            ctx.scale(-1, 1);
            ctx.translate(-screenW / 2, 0);
          } else if (item.anomalyType === 'shaking') {
            // Violently vibrating
            ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4);
          } else if (item.anomalyType === 'rainbow') {
            // RGB Gaming rainbow cycling
            const hue = (gameState.current.totalTime * 280) % 360;
            customTextColor = `hsl(${hue}, 100%, 70%)`;
          } else if (item.anomalyType === 'giant') {
            // Giant oversized text
            customFontRole = 'bold 18px "Zen Kaku Gothic New", sans-serif';
            customFontName = '900 24px "Zen Kaku Gothic New", sans-serif';
            customTextColor = '#fef08a';
          } else if (item.anomalyType === 'tiny') {
            // Tiny microscopic text
            customFontRole = '8px "Zen Kaku Gothic New", sans-serif';
            customFontName = '8px "Zen Kaku Gothic New", sans-serif';
          } else if (item.anomalyType === 'ghost') {
            // Chromatic aberration RGB glitch
            const ghostOffset = Math.sin(gameState.current.totalTime * 14) * 3;
            ctx.fillStyle = 'rgba(239, 68, 68, 0.6)';
            ctx.font = '14px "Zen Kaku Gothic New", sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(item.role, screenW * 0.45 + ghostOffset, cred.y);
            ctx.textAlign = 'left';
            ctx.fillText(item.name, screenW * 0.53 - ghostOffset, cred.y);
          }
        }

        // Header vs regular role
        if (item.isHeader) {
          ctx.font = 'bold 15px "Zen Kaku Gothic New", sans-serif';
          ctx.fillStyle = '#60a5fa';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(item.name, screenW / 2, cred.y);
        } else {
          // Standard / Anomaly line
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.font = customFontRole;
          ctx.fillStyle = cred.detected ? '#10b981' : customTextColor || '#9ca3af';
          ctx.fillText(item.role, screenW * 0.45, cred.y);

          // Name column
          ctx.textAlign = 'left';
          const isExtraLong = item.name.length > 25;
          ctx.font = isExtraLong
            ? '600 13px "Zen Kaku Gothic New", sans-serif'
            : customFontName;

          ctx.fillStyle = cred.detected
            ? '#34d399'
            : cred.missed
            ? '#ef4444'
            : customTextColor || '#ffffff';
          ctx.fillText(item.name, screenW * 0.53, cred.y);
        }

        // If detected, draw green stamp badge on the right
        if (cred.detected) {
          ctx.fillStyle = '#10b981';
          ctx.strokeStyle = '#059669';
          ctx.lineWidth = 1;
          const badgeX = Math.min(screenW - 110, screenW * 0.76);
          ctx.strokeRect(badgeX, cred.y - 12, 94, 24);
          ctx.fillStyle = '#10b981';
          ctx.font = 'bold 11px "Zen Kaku Gothic New", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('【 検問完了 】', badgeX + 47, cred.y);
        }

        ctx.restore();
      });

      // Draw Floating Stamps & Popups
      gameState.current.stamps.forEach((s) => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, s.alpha);
        ctx.font = '900 18px "Zen Kaku Gothic New", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (s.type === 'correct') {
          ctx.fillStyle = '#10b981';
          ctx.shadowColor = '#059669';
          ctx.shadowBlur = 10;
        } else {
          ctx.fillStyle = '#ef4444';
          ctx.shadowColor = '#dc2626';
          ctx.shadowBlur = 10;
        }

        ctx.fillText(s.text, s.x, s.y);
        ctx.restore();
      });

      // Draw Custom Cinema Inspector Crosshair Cursor
      if (mousePos.current.x > 0 && mousePos.current.y > 0) {
        const mx = mousePos.current.x;
        const my = mousePos.current.y;

        ctx.strokeStyle = hoveredCreditId.current ? '#38bdf8' : 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1.5;

        // Circle lens
        ctx.beginPath();
        ctx.arc(mx, my, 18, 0, Math.PI * 2);
        ctx.stroke();

        // Crosshairs
        ctx.beginPath();
        ctx.moveTo(mx - 24, my); ctx.lineTo(mx - 8, my);
        ctx.moveTo(mx + 8, my); ctx.lineTo(mx + 24, my);
        ctx.moveTo(mx, my - 24); ctx.lineTo(mx, my - 8);
        ctx.moveTo(mx, my + 8); ctx.lineTo(mx, my + 24);
        ctx.stroke();

        // Center dot
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(mx, my, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    };

    const handleAnomalyMissed = (cred: ScrollingCredit, screenW: number) => {
      gameState.current.missed++;
      gameState.current.combo = 0;
      setCombo(0);
      gameState.current.strikes++;
      setStrikes(gameState.current.strikes);
      gameState.current.cameraShake = 18;

      sound.playAnomalyMissed();

      const reason = cred.item.anomalyHint || '違和感が見逃された！';
      setRecentLog(`⚠️ 見逃し！: ${reason}`);

      gameState.current.stamps.push({
        id: `stamp-${Date.now()}`,
        x: screenW / 2,
        y: 60,
        text: '【 見 逃 し 警 報 ! 】',
        type: 'miss',
        alpha: 1.0,
      });

      if (gameState.current.strikes >= 3) {
        // GAME OVER
        gameState.current.running = false;
        sound.playGameOver();
        onGameOver(gameState.current.score, {
          caught: gameState.current.caught,
          missed: gameState.current.missed,
          maxCombo: gameState.current.maxCombo,
        });
      }
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);

  // Handle player click or touch inspection
  const handleInspectClick = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!gameState.current.running || gameState.current.paused) return;

    let clientX = 0;
    let clientY = 0;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;

    // Check which credit was clicked
    const clickedCredit = gameState.current.credits.find((c) => {
      return Math.abs(c.y - clickY) < 26;
    });

    if (!clickedCredit) return;

    if (clickedCredit.detected) {
      return; // Already solved
    }

    if (clickedCredit.item.isAnomaly) {
      // SUCCESSFUL DETECTION!
      clickedCredit.detected = true;
      gameState.current.caught++;
      gameState.current.combo++;
      if (gameState.current.combo > gameState.current.maxCombo) {
        gameState.current.maxCombo = gameState.current.combo;
      }
      setCombo(gameState.current.combo);
      setCaughtCount(gameState.current.caught);

      const bonus = 400 + gameState.current.combo * 150;
      gameState.current.score += bonus;
      setScore(gameState.current.score);

      sound.playAnomalyFound();

      const detail = clickedCredit.item.anomalyHint || '違和感を特定！';
      setRecentLog(`🎯 特定成功: ${detail}`);

      gameState.current.stamps.push({
        id: `stamp-${Date.now()}`,
        x: clickX,
        y: clickY - 10,
        text: `【 検問的中 +${bonus} 】`,
        type: 'correct',
        alpha: 1.0,
      });

      // Level progression every 4 anomalies
      const nextLevel = Math.min(5, Math.floor(gameState.current.caught / 4) + 1);
      if (nextLevel !== gameState.current.level) {
        gameState.current.level = nextLevel;
        setLevel(nextLevel);
        sound.playPowerup();
      }
    } else {
      // FALSE ALARM (Clicked innocent credit)
      if (gameState.current.falseAlarmCooldown <= 0) {
        gameState.current.falseAlarmCooldown = 1.0;
        gameState.current.combo = 0;
        setCombo(0);
        sound.playAnomalyMissed();
        setRecentLog('❌ 誤認逮捕！ そのスタッフは正常なクレジットです');

        gameState.current.stamps.push({
          id: `stamp-${Date.now()}`,
          x: clickX,
          y: clickY - 10,
          text: '【 誤認逮捕！ 】',
          type: 'wrong',
          alpha: 1.0,
        });
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black select-none overflow-hidden cursor-crosshair"
      onMouseMove={(e) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          mousePos.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
          };
        }
      }}
      onClick={handleInspectClick}
      onTouchStart={handleInspectClick}
    >
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

        {/* Center Title & Level */}
        <div className="text-center">
          <div className="text-[10px] tracking-widest text-neutral-400 uppercase font-cinzel">Glitch Inspector</div>
          <div className="text-xs font-bold text-neutral-200">
            違和感エンドロール捜査官 · <span className="text-amber-400">LV.{level}</span>
          </div>
        </div>

        {/* Right Stats: Score & Strikes */}
        <div className="flex items-center gap-4 text-right">
          <div>
            <div className="text-[10px] text-neutral-400 tracking-wider">SCORE</div>
            <div className="font-mono text-base font-bold text-amber-300 tabular-nums">{score}</div>
          </div>
          <div>
            <div className="text-[10px] text-neutral-400 tracking-wider">STRIKES</div>
            <div className="flex items-center gap-1 mt-0.5 justify-end">
              {[1, 2, 3].map((s) => (
                <AlertTriangle
                  key={s}
                  className={`w-4 h-4 ${s <= strikes ? 'text-rose-500 fill-rose-500' : 'text-neutral-700'}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Investigator Log Strip at Bottom */}
      <div className="absolute bottom-3 inset-x-4 max-w-lg mx-auto flex items-center justify-between gap-3 bg-neutral-950/85 backdrop-blur-sm px-4 py-2 rounded-lg border border-neutral-800 pointer-events-none z-20">
        <div className="flex items-center gap-2 overflow-hidden text-xs text-neutral-300">
          <Search className="w-4 h-4 text-sky-400 shrink-0" />
          <span className="truncate">{recentLog}</span>
        </div>
        {combo > 1 && (
          <div className="text-xs font-mono font-bold text-amber-400 shrink-0 animate-pulse">
            {combo} COMBO!
          </div>
        )}
      </div>

      {/* Pause Modal */}
      {isPaused && (
        <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-neutral-900 border border-neutral-700 p-6 rounded-lg text-center max-w-xs w-full shadow-2xl">
            <h3 className="text-xl font-bold font-serif-jp text-white mb-2">上映一時停止</h3>
            <p className="text-xs text-neutral-400 mb-6">捜査活動を休止中</p>
            <div className="flex flex-col gap-3">
              <button
                onClick={togglePause}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold rounded text-sm transition"
              >
                捜査再開
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
