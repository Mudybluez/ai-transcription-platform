import React, { useEffect, useRef } from 'react';

const HeroParticles = () => {
    const canvasRef = useRef(null);
    const mouseRef = useRef({ x: -1000, y: -1000, active: false, distance: 1000 });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let animationFrameId;

        let width = 0;
        let height = 0;

        // Всего 140 звезд:
        // - 80 фоновых звезд парят в космосе.
        // - 60 звезд (по 30 на каждую сторону) собираются и формируют скобки { }.
        const numParticles = 140;
        const braceParticlesCount = 60; // 30 левая, 30 правая
        const particles = [];

        // 5 красивых blend-цветов (белый, голубой, фиолетовый, розовый, ярко-оранжевый)
        const particleColors = [
            '#ffffff', // Белый
            '#38bdf8', // Голубой
            '#c084fc', // Фиолетовый
            '#f472b6', // Розовый
            '#f97316'  // Ярко-оранжевый
        ];

        // Инициализируем частицы
        const initParticles = (w, h) => {
            particles.length = 0;
            for (let i = 0; i < numParticles; i++) {
                const isBraceOutline = i < braceParticlesCount;
                const baseColor = particleColors[i % particleColors.length];
                particles.push({
                    id: i,
                    x: Math.random() * w,
                    y: Math.random() * h,
                    // Очень медленный, величественный дрейф в невесомости в покое
                    vx: (Math.random() - 0.5) * 0.05,
                    vy: (Math.random() - 0.5) * 0.05,
                    size: Math.random() * 1.5 + 0.8,
                    baseColor,
                    angle: Math.random() * Math.PI * 2,
                    seed: Math.random() * 100,
                    
                    // Параметры сборки фигур (только для 60 частиц скобок)
                    isBraceOutline,
                    targetSide: isBraceOutline ? (i < braceParticlesCount / 2 ? 'left' : 'right') : null,
                    // Равномерное смещение по кривой скобки (от 0 до 1)
                    curveT: isBraceOutline ? (i % (braceParticlesCount / 2)) / (braceParticlesCount / 2 - 1) : 0
                });
            }
        };

        const resizeCanvas = () => {
            const rect = canvas.getBoundingClientRect();
            width = rect.width;
            height = rect.height;
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.ceil(width * dpr);
            canvas.height = Math.ceil(height * dpr);
            ctx.scale(dpr, dpr);
            
            initParticles(width, height);
        };
        resizeCanvas();

        const handleMouseMove = (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            mouseRef.current = { x, y, active: true };
        };

        const handleMouseLeave = () => {
            mouseRef.current = { x: -1000, y: -1000, active: false };
        };

        const parent = canvas.parentElement;
        if (parent) {
            parent.addEventListener('mousemove', handleMouseMove);
            parent.addEventListener('mouseleave', handleMouseLeave);
        }
        window.addEventListener('resize', resizeCanvas);

        const lerpColor = (c1, c2, w) => {
            const r1 = parseInt(c1.substring(1, 3), 16);
            const g1 = parseInt(c1.substring(3, 5), 16);
            const b1 = parseInt(c1.substring(5, 7), 16);

            const r2 = parseInt(c2.substring(1, 3), 16);
            const g2 = parseInt(c2.substring(3, 5), 16);
            const b2 = parseInt(c2.substring(5, 7), 16);

            const r = Math.round(r1 + (r2 - r1) * w);
            const g = Math.round(g1 + (g2 - g1) * w);
            const b = Math.round(b1 + (b2 - b1) * w);

            return `rgb(${r}, ${g}, ${b})`;
        };

        const getDistanceToRect = (mx, my, rx, ry, rw, rh) => {
            const dx = Math.max(rx - mx, 0, mx - (rx + rw));
            const dy = Math.max(ry - my, 0, my - (ry + rh));
            return Math.sqrt(dx * dx + dy * dy);
        };

        const getBraceGradient = (x, cy, height, alpha) => {
            const grad = ctx.createLinearGradient(x, cy - height / 2, x, cy + height / 2);
            grad.addColorStop(0, `rgba(244, 114, 182, ${alpha})`);     // Розовый
            grad.addColorStop(0.25, `rgba(56, 189, 248, ${alpha})`);   // Голубой
            grad.addColorStop(0.5, `rgba(168, 85, 247, ${alpha})`);    // Фиолетовый
            grad.addColorStop(0.75, `rgba(249, 115, 22, ${alpha})`);   // Ярко-оранжевый
            grad.addColorStop(1, `rgba(255, 255, 255, ${alpha})`);     // Белый
            return grad;
        };

        // Анимационный цикл
        const animate = () => {
            const now = performance.now();
            ctx.clearRect(0, 0, width, height);

            const mouse = mouseRef.current;
            const cx = width / 2;
            const cy = height / 2;

            // Динамически рассчитываем прямоугольник площади текста героя
            const tw = Math.min(width * 0.8, 760); 
            const th = 150; 
            const rx = cx - tw / 2;
            const ry = cy - th / 2;

            let distance = 1000;
            if (mouse.active) {
                distance = getDistanceToRect(mouse.x, mouse.y, rx, ry, tw, th);
            }

            const braceOffset = Math.min(410, width * 0.44); 
            const braceHeight = Math.min(180, height * 0.75); 

            // Геометрия изгибов
            const hookWidth = 22; 
            const cuspWidth = 24; 

            // Сила притяжения (weight)
            const influenceRadius = 250;
            let weight = 0;

            if (mouse.active) {
                if (distance === 0) {
                    weight = 1.0;
                } else if (distance < influenceRadius) {
                    weight = Math.pow(1 - distance / influenceRadius, 1.3);
                }
            }

            // Функция построения пути скобки
            const drawBracePath = (side) => {
                const dir = side === 'left' ? -1 : 1;
                const baseX = cx + dir * braceOffset;
                
                for (let step = 0; step <= 40; step++) {
                    const t = step / 40;
                    const targetY = cy - braceHeight / 2 + t * braceHeight;
                    let targetX = baseX;
                    
                    if (t < 0.15) {
                        // Верхний крючок: изгибается горизонтально внутрь к центру
                        const pct = t / 0.15;
                        targetX -= dir * hookWidth * Math.pow(1 - pct, 2.5);
                    } else if (t > 0.85) {
                        // Нижний крючок: изгибается горизонтально внутрь к центру
                        const pct = (1 - t) / 0.15;
                        targetX -= dir * hookWidth * Math.pow(1 - pct, 2.5);
                    } else if (t >= 0.44 && t <= 0.56) {
                        // Средний носик: резко изгибается наружу
                        const pct = (t - 0.44) / 0.06;
                        const dist = 1 - Math.abs(pct - 1);
                        targetX += dir * cuspWidth * Math.sin(dist * Math.PI / 2);
                    }

                    if (step === 0) {
                        ctx.moveTo(targetX, targetY);
                    } else {
                        ctx.lineTo(targetX, targetY);
                    }
                }
            };

            // 1. ОТРИСОВКА МНОГОСЛОЙНОГО НЕОНОВОГО ОБЪЕМНОГО СВЕЧЕНИЯ
            if (weight > 0.02) {
                ctx.save();
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                
                // Включаем аддитивное смешивание для космического свечения
                ctx.globalCompositeOperation = 'screen';

                const drawLayer = (side, wWidth, wAlpha, wBlur, wBlurColor) => {
                    const dir = side === 'left' ? -1 : 1;
                    const baseX = cx + dir * braceOffset;
                    
                    ctx.beginPath();
                    drawBracePath(side);
                    
                    ctx.strokeStyle = getBraceGradient(baseX, cy, braceHeight, wAlpha * weight);
                    ctx.lineWidth = wWidth;
                    
                    if (wBlur > 0 && wBlurColor) {
                        ctx.shadowColor = wBlurColor;
                        ctx.shadowBlur = wBlur * weight;
                    } else {
                        ctx.shadowBlur = 0;
                    }
                    
                    ctx.stroke();
                };

                // Свечение уровня 1: Широкая мягкая корона (Corona Glow)
                drawLayer('left', 34, 0.06, 24, '#c084fc');
                drawLayer('right', 34, 0.06, 24, '#c084fc');

                // Свечение уровня 2: Яркий неоновый стержень (Neon Core Glow)
                drawLayer('left', 14, 0.16, 12, '#38bdf8');
                drawLayer('right', 14, 0.16, 12, '#38bdf8');

                // Свечение уровня 3: Тонкий глянцевый стеклянный центр (Light Rod Core)
                drawLayer('left', 5, 0.38, 0);
                drawLayer('right', 5, 0.38, 0);

                // Свечение уровня 4: Ультра-тонкая кристально-белая нить (High-Intensity String)
                ctx.shadowBlur = 0;
                ctx.beginPath();
                drawBracePath('left');
                ctx.strokeStyle = `rgba(255, 255, 255, ${weight * 0.8})`;
                ctx.lineWidth = 1.2;
                ctx.stroke();

                ctx.beginPath();
                drawBracePath('right');
                ctx.strokeStyle = `rgba(255, 255, 255, ${weight * 0.8})`;
                ctx.lineWidth = 1.2;
                ctx.stroke();

                ctx.restore();
            }

            // 2. ОТРИСОВКА ЧАСТИЦ (ЗВЕЗД)
            ctx.save();
            ctx.globalCompositeOperation = 'screen';

            particles.forEach((p) => {
                p.x += p.vx;
                p.y += p.vy;

                if (p.x < 0 || p.x > width) p.vx *= -1;
                if (p.y < 0 || p.y > height) p.vy *= -1;

                // 80 фоновых звезд: мягко парят и мерцают своими красивыми цветами
                if (!p.isBraceOutline) {
                    const twinkle = 0.14 + Math.sin(now * 0.002 + p.seed) * 0.1;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fillStyle = p.baseColor;
                    ctx.globalAlpha = twinkle;
                    ctx.fill();
                    return;
                }

                // 60 контурных звезд собираются в скобки { }
                const dir = p.targetSide === 'left' ? -1 : 1;
                const baseX = cx + dir * braceOffset;
                
                let targetX = baseX;
                let targetY = cy - braceHeight / 2 + p.curveT * braceHeight;

                const t = p.curveT;
                if (t < 0.15) {
                    // Изгиб крючка внутрь к центру
                    const pct = t / 0.15;
                    targetX -= dir * hookWidth * Math.pow(1 - pct, 2.5);
                } else if (t > 0.85) {
                    // Изгиб крючка внутрь к центру
                    const pct = (1 - t) / 0.15;
                    targetX -= dir * hookWidth * Math.pow(1 - pct, 2.5);
                } else if (t >= 0.44 && t <= 0.56) {
                    // Изгиб носика наружу от центра
                    const pct = (t - 0.44) / 0.06;
                    const dist = 1 - Math.abs(pct - 1);
                    targetX += dir * cuspWidth * Math.sin(dist * Math.PI / 2);
                }

                // Плавное притяжение координат (Lerp)
                const currentX = p.x + (targetX - p.x) * weight;
                const currentY = p.y + (targetY - p.y) * weight;

                // Микро-колебания в невесомости в покое
                const floatNoise = 8 * (1 - weight);
                const noiseX = Math.sin(now * 0.0018 + p.seed) * floatNoise;
                const noiseY = Math.cos(now * 0.0014 + p.seed) * floatNoise;

                const drawX = currentX + noiseX;
                const drawY = currentY + noiseY;

                // Точки всегда сохраняют свои великолепные blend-цвета!
                const particleColor = p.baseColor;
                const opacity = 0.28 + weight * 0.62;
                const size = p.size * (1.1 + weight * 0.6);

                // Отрисовка цветного неонового ореола вокруг каждой собранной точки скобок
                if (weight > 0.05) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(drawX, drawY, size * 2.6, 0, Math.PI * 2);
                    ctx.fillStyle = particleColor;
                    ctx.globalAlpha = weight * 0.16;
                    ctx.fill();
                    ctx.restore();
                }

                // Отрисовка супер-объемных стеклянных сфер с 3D-бликом
                ctx.save();
                ctx.beginPath();
                ctx.arc(drawX, drawY, size, 0, Math.PI * 2);
                
                // Радиальный градиент с бликом сбоку
                const grad = ctx.createRadialGradient(
                    drawX - size * 0.35,
                    drawY - size * 0.35,
                    size * 0.04,
                    drawX,
                    drawY,
                    size
                );
                
                grad.addColorStop(0, '#ffffff'); // Световой блик
                grad.addColorStop(0.2, particleColor); // Основной насыщенный цвет
                grad.addColorStop(0.85, lerpColor(particleColor, '#000000', 0.55)); // Собственная тень сферы
                grad.addColorStop(1, 'transparent');
                
                ctx.fillStyle = grad;
                ctx.globalAlpha = opacity;
                ctx.fill();
                ctx.restore();
            });

            ctx.restore();
            animationFrameId = requestAnimationFrame(animate);
        };
        animate();

        return () => {
            if (parent) {
                parent.removeEventListener('mousemove', handleMouseMove);
                parent.removeEventListener('mouseleave', handleMouseLeave);
            }
            window.removeEventListener('resize', resizeCanvas);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 1
            }}
        />
    );
};

export default HeroParticles;
