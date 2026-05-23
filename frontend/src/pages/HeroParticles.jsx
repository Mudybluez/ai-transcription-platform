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
        // - 80 звезд продолжают всегда свободно летать в космосе для красивого фона.
        // - 60 звезд (по 30 на каждую сторону) собираются и формируют тонкие четкие контуры скобок { }.
        const numParticles = 140;
        const braceParticlesCount = 60; // 30 левая, 30 правая
        const particles = [];

        // Инициализируем частицы
        const initParticles = (w, h) => {
            particles.length = 0;
            for (let i = 0; i < numParticles; i++) {
                const isBraceOutline = i < braceParticlesCount;
                particles.push({
                    id: i,
                    // Случайное стартовое положение как плавающие звезды
                    x: Math.random() * w,
                    y: Math.random() * h,
                    // Очень медленный, величественный дрейф в невесомости в покое (в 3.5 раза медленнее)
                    vx: (Math.random() - 0.5) * 0.08,
                    vy: (Math.random() - 0.5) * 0.08,
                    size: Math.random() * 1.4 + 0.8,
                    angle: Math.random() * Math.PI * 2,
                    angularSpeed: (Math.random() - 0.5) * 0.005,
                    
                    // Параметры сборки фигур (только для выделенного подконтура из 60 частиц)
                    isBraceOutline,
                    targetSide: isBraceOutline ? (i < braceParticlesCount / 2 ? 'left' : 'right') : null,
                    // Равномерное смещение по кривой скобки (от 0 до 1) для идеального тонкого контура
                    curveT: isBraceOutline ? (i % (braceParticlesCount / 2)) / (braceParticlesCount / 2 - 1) : 0,
                    seed: Math.random() * 100
                });
            }
        };

        const resizeCanvas = () => {
            const rect = canvas.getBoundingClientRect();
            width = rect.width;
            height = rect.height;
            // Учитываем ретину для идеальной четкости звезд
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.ceil(width * dpr);
            canvas.height = Math.ceil(height * dpr);
            ctx.scale(dpr, dpr);
            
            initParticles(width, height);
        };
        resizeCanvas();

        // Отслеживаем движение мыши
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

        // Функция лерпа цветов
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

        // Функция расчета расстояния от точки (mx, my) до прямоугольника [rx, ry, rw, rh]
        const getDistanceToRect = (mx, my, rx, ry, rw, rh) => {
            const dx = Math.max(rx - mx, 0, mx - (rx + rw));
            const dy = Math.max(ry - my, 0, my - (ry + rh));
            return Math.sqrt(dx * dx + dy * dy);
        };

        // Анимационный цикл
        const animate = () => {
            const now = performance.now();
            ctx.clearRect(0, 0, width, height);

            const mouse = mouseRef.current;
            const cx = width / 2;
            const cy = height / 2;

            // Динамически рассчитываем зону текста героя (прямоугольник)
            const tw = Math.min(width * 0.8, 760); // Реальная ширина текста героя
            const th = 150; // Высота зоны заголовка и подзаголовка
            const rx = cx - tw / 2;
            const ry = cy - th / 2;

            // Расстояние до границ зоны текста
            let distance = 1000;
            if (mouse.active) {
                distance = getDistanceToRect(mouse.x, mouse.y, rx, ry, tw, th);
            }

            // Настраиваем параметры скобок под пропорции экрана
            const braceOffset = Math.min(410, width * 0.44); // Зазор от центра до вертикальной оси скобок
            const braceHeight = Math.min(180, height * 0.75); // Высота скобок { }

            // Радиус влияния за пределами зоны текста
            const influenceRadius = 250;
            let weight = 0;

            if (mouse.active) {
                if (distance === 0) {
                    // Если курсор находится строго ВНУТРИ зоны текста, фигуры четко и на 100% собраны!
                    weight = 1.0;
                } else if (distance < influenceRadius) {
                    // Если снаружи, сила притяжения плавно падает до нуля по мере отдаления
                    weight = Math.pow(1 - distance / influenceRadius, 1.3);
                }
            }

            particles.forEach((p) => {
                // 1. Медленное величественное движение плавающих звезд (невесомость)
                p.x += p.vx;
                p.y += p.vy;

                // Плавный мягкий отскок от краев Canvas
                if (p.x < 0 || p.x > width) p.vx *= -1;
                if (p.y < 0 || p.y > height) p.vy *= -1;

                // Если частица не входит в 60 контурных звезд скобок, она просто летает как звезда
                if (!p.isBraceOutline) {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fillStyle = '#cbd5e1';
                    ctx.globalAlpha = 0.22;
                    ctx.fill();
                    return;
                }

                // 2. Расчет ТОЧНЫХ координат контура фигурных скобок { }
                // dir = -1 для левой {, dir = 1 для правой }
                const dir = p.targetSide === 'left' ? -1 : 1;
                const baseX = cx + dir * braceOffset; // Вертикальная ось скобки
                
                let targetX = baseX;
                let targetY = cy - braceHeight / 2 + p.curveT * braceHeight;

                const t = p.curveT; // Позиция точки на скобке от 0 до 1
                const hookWidth = 20; // Длина закругления крючков { }
                const cuspWidth = 20; // Длина выступа среднего носика { }

                // Геометрия левой и правой скобок { }
                if (t < 0.15) {
                    // Верхний крючок скобки:
                    // Начинается у кончика (ближе к тексту, baseX + dir * hookWidth) и изгибается влево к baseX.
                    const pct = t / 0.15;
                    targetX += dir * hookWidth * Math.pow(1 - pct, 2.5);
                } else if (t > 0.85) {
                    // Нижний крючок скобки:
                    // Начинается у baseX и изгибается вправо к baseX + dir * hookWidth на конце.
                    const pct = (1 - t) / 0.15;
                    targetX += dir * hookWidth * Math.pow(1 - pct, 2.5);
                } else if (t >= 0.44 && t <= 0.56) {
                    // Острый средний носик скобки:
                    // Резко изгибается наружу (в противоположную сторону от текста)
                    const pct = (t - 0.44) / 0.06; // 0 to 2, пик ровно на t = 0.5
                    const dist = 1 - Math.abs(pct - 1); // 0 to 1 (пик) to 0
                    targetX -= dir * cuspWidth * Math.sin(dist * Math.PI / 2);
                }

                // 3. Плавная интерполяция положения (свободный полет <-> сборка контура)
                const currentX = p.x + (targetX - p.x) * weight;
                const currentY = p.y + (targetY - p.y) * weight;

                // 4. Микро-колебания в невесомости (гаснут до нуля, когда фигура полностью собрана)
                const floatNoise = 8 * (1 - weight);
                const noiseX = Math.sin(now * 0.0018 + p.seed) * floatNoise;
                const noiseY = Math.cos(now * 0.0014 + p.seed) * floatNoise;

                const drawX = currentX + noiseX;
                const drawY = currentY + noiseY;

                // 5. Динамические свойства и смена цвета
                const opacity = 0.25 + weight * 0.65;
                const size = p.size * (1.0 + weight * 0.5);

                // Фигурные скобки ВСЕГДА БЕЛЫЕ во время сбора (weight < 0.96)
                // Только когда ВСЕ точки полностью собрались (weight >= 0.96), скобка загорается неоновым фиолетовым!
                let particleColor = '#cbd5e1';
                if (weight >= 0.96) {
                    const colorTransition = (weight - 0.96) / 0.04; // 0 to 1
                    particleColor = lerpColor('#ffffff', '#a855f7', colorTransition);
                } else if (weight > 0.3) {
                    particleColor = '#ffffff'; // Чистый белый при сборке
                }

                // Рисуем контурную точку скобки
                ctx.beginPath();
                ctx.arc(drawX, drawY, size, 0, Math.PI * 2);
                ctx.fillStyle = particleColor;
                ctx.globalAlpha = opacity;
                ctx.fill();

                // 6. Неоновый ореол при полной сборке и фиолетовом цвете
                if (weight >= 0.96) {
                    ctx.beginPath();
                    ctx.arc(drawX, drawY, size * 2.5, 0, Math.PI * 2);
                    ctx.fillStyle = '#a855f7';
                    ctx.globalAlpha = (weight - 0.96) / 0.04 * 0.16;
                    ctx.fill();
                }
            });

            ctx.globalAlpha = 1.0;
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
