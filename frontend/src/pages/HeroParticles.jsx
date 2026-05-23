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
        const numParticles = 140; // 70 для левой скобки, 70 для правой скобки
        const particles = [];

        // Инициализируем частицы
        const initParticles = (w, h) => {
            particles.length = 0;
            for (let i = 0; i < numParticles; i++) {
                particles.push({
                    // Случайное стартовое положение как плавающие звезды
                    x: Math.random() * w,
                    y: Math.random() * h,
                    // Дрейф в невесомости (скорость и угол)
                    vx: (Math.random() - 0.5) * 0.28,
                    vy: (Math.random() - 0.5) * 0.28,
                    size: Math.random() * 1.5 + 0.8,
                    angle: Math.random() * Math.PI * 2,
                    angularSpeed: (Math.random() - 0.5) * 0.01,
                    // Целевая сторона: 0 - левая скобка {, 1 - правая скобка }
                    targetSide: i < numParticles / 2 ? 'left' : 'right',
                    // Смещение по кривой скобки (0 to 1)
                    curveT: (i % (numParticles / 2)) / (numParticles / 2 - 1),
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

        // Отслеживаем движение мыши по секции
        const handleMouseMove = (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Расстояние до центра героя (где находится текст)
            const cx = width / 2;
            const cy = height / 2;
            const dx = x - cx;
            const dy = y - cy;
            const distance = Math.sqrt(dx * dx + dy * dy);

            mouseRef.current = { x, y, active: true, distance };
        };

        const handleMouseLeave = () => {
            mouseRef.current = { x: -1000, y: -1000, active: false, distance: 1000 };
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

        // Анимационный цикл частиц
        const animate = () => {
            const now = performance.now();
            ctx.clearRect(0, 0, width, height);

            const mouse = mouseRef.current;
            const cx = width / 2;
            const cy = height / 2;

            // Настраиваем размеры скобок под экран
            const braceOffset = Math.min(380, width * 0.43); // Сдвиг скобок влево/вправо от центра
            const braceHeight = Math.min(185, height * 0.75); // Высота скобок

            // Радиус гравитационного притяжения к тексту
            const influenceRadius = 380;
            let weight = 0;
            if (mouse.active && mouse.distance < influenceRadius) {
                // Плавное нарастание силы притяжения по мере приближения курсора
                weight = Math.pow(1 - mouse.distance / influenceRadius, 1.3);
            }

            particles.forEach((p) => {
                // 1. Движение в свободном космосе (невесомость)
                p.x += p.vx;
                p.y += p.vy;
                p.angle += p.angularSpeed;

                // Мягкий отскок от краев Canvas
                if (p.x < 0 || p.x > width) p.vx *= -1;
                if (p.y < 0 || p.y > height) p.vy *= -1;

                // 2. Вычисление целевой точки на скобке { или }
                const dir = p.targetSide === 'left' ? -1 : 1;
                const startX = cx + dir * braceOffset;
                
                let targetX = startX;
                let targetY = cy - braceHeight / 2 + p.curveT * braceHeight;

                // Отрисовка геометрии скобки {}
                // t идет от 0 до 1 сверху вниз по высоте скобки
                const t = p.curveT;
                const curveDepth = 26; // Глубина изгибов скобок

                if (t < 0.12) {
                    // Верхний изгиб скобки (уходит наружу от центра)
                    const pct = t / 0.12;
                    targetX += dir * curveDepth * (1 - Math.sin(pct * Math.PI / 2));
                } else if (t > 0.88) {
                    // Нижний изгиб скобки (уходит наружу от центра)
                    const pct = (1 - t) / 0.12;
                    targetX += dir * curveDepth * (1 - Math.sin(pct * Math.PI / 2));
                } else if (t >= 0.42 && t <= 0.58) {
                    // Средний носик скобки (направлен наружу от центра)
                    const pct = (t - 0.42) / 0.08; // 0 to 2
                    const dist = 1 - Math.abs(pct - 1); // 0 to 1 to 0
                    targetX += dir * curveDepth * Math.sin(dist * Math.PI / 2);
                }

                // 3. Плавный переход (Lerp) между свободным полетом и формой скобок
                const currentX = p.x + (targetX - p.x) * weight;
                const currentY = p.y + (targetY - p.y) * weight;

                // 4. Микро-колебания в невесомости (уменьшаются до 0, когда фигура полностью собрана)
                const floatNoise = 10 * (1 - weight);
                const noiseX = Math.sin(now * 0.002 + p.seed) * floatNoise;
                const noiseY = Math.cos(now * 0.0015 + p.seed) * floatNoise;

                const drawX = currentX + noiseX;
                const drawY = currentY + noiseY;

                // 5. Динамические свойства частиц
                const opacity = 0.22 + weight * 0.72; // Становятся ярче при наведении
                const size = p.size * (1.0 + weight * 0.65); // Увеличиваются при сборке фигуры

                // Плавное окрашивание из мягкого белого в неоново-пурпурный
                const particleColor = lerpColor('#cbd5e1', '#c084fc', weight);

                // Рисуем частицу (звезду)
                ctx.beginPath();
                ctx.arc(drawX, drawY, size, 0, Math.PI * 2);
                ctx.fillStyle = particleColor;
                ctx.globalAlpha = opacity;
                ctx.fill();

                // 6. Дополнительное неоновое свечение для собранных скобок
                if (weight > 0.4) {
                    ctx.beginPath();
                    ctx.arc(drawX, drawY, size * 2.2, 0, Math.PI * 2);
                    ctx.fillStyle = '#a855f7';
                    ctx.globalAlpha = (weight - 0.4) * 0.12;
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
