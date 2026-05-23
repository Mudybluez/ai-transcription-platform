import React, { useEffect, useRef } from 'react';

const SolarSystemBackground = ({ history = [], introState = 'playing', onIntroComplete }) => {
    const canvasRef = useRef(null);
    const introStateRef = useRef(introState);
    const onIntroCompleteRef = useRef(onIntroComplete);
    const planetsRef = useRef([]);

    useEffect(() => {
        introStateRef.current = introState;
    }, [introState]);

    useEffect(() => {
        onIntroCompleteRef.current = onIntroComplete;
    }, [onIntroComplete]);

    // Космические цвета для планет и свечений
    const cosmicColors = [
        '#38bdf8', // Голубой (Cyan)
        '#34d399', // Изумрудный (Emerald)
        '#fb7185', // Нежно-розовый (Rose)
        '#fbbf24', // Янтарный (Amber)
        '#818cf8', // Индиго (Indigo)
        '#2dd4bf', // Бирюзовый (Teal)
        '#a78bfa', // Лавандовый (Purple)
        '#f472b6'  // Розовый (Pink)
    ];

    // Позиции для фоновых свечений (небул) в vmax для адаптивности
    const glowPositions = [
        { top: '15%', left: '15%', size: '35vmax' },
        { top: '55%', left: '70%', size: '40vmax' },
        { top: '10%', left: '75%', size: '30vmax' },
        { top: '70%', left: '10%', size: '45vmax' },
        { top: '35%', left: '40%', size: '35vmax' },
        { top: '75%', left: '45%', size: '30vmax' },
        { top: '45%', left: '15%', size: '38vmax' },
        { top: '25%', left: '80%', size: '32vmax' }
    ];

    const readyItems = history.filter(item => {
        const analysis = typeof item.structured_analysis === 'string'
            ? JSON.parse(item.structured_analysis)
            : item.structured_analysis;
        return !!analysis;
    });

    // Отслеживаем изменения истории и бесшовно синхронизируем планеты в planetsRef,
    // сохраняя текущие углы вращения уже существующих планет, чтобы предотвратить визуальные скачки.
    useEffect(() => {
        let nextPlanets = [];

        if (readyItems.length === 0) {
            nextPlanets = [
                {
                    id: 'default-1',
                    orbitRadius: 120,
                    size: 7,
                    color: '#38bdf8',
                    speed: 0.003,
                    moonsCount: 2
                },
                {
                    id: 'default-2',
                    orbitRadius: 180,
                    size: 9,
                    color: '#818cf8',
                    speed: -0.002,
                    moonsCount: 3
                },
                {
                    id: 'default-3',
                    orbitRadius: 240,
                    size: 8,
                    color: '#34d399',
                    speed: 0.0015,
                    moonsCount: 1
                }
            ];
        } else {
            const maxPlanets = 6;
            const itemsToRender = readyItems.slice(0, maxPlanets);
            nextPlanets = itemsToRender.map((item, index) => {
                const analysis = typeof item.structured_analysis === 'string'
                    ? JSON.parse(item.structured_analysis)
                    : item.structured_analysis;

                const topicsCount = analysis?.key_topics?.length || 0;
                const moonsCount = Math.min(4, topicsCount > 0 ? topicsCount : (index % 3) + 1);
                const orbitRadius = 120 + index * 55;
                const size = Math.min(12, Math.max(5, 5 + moonsCount * 0.7));
                const direction = index % 2 === 0 ? 1 : -1;
                const speed = (0.005 / (index + 1)) * direction;

                return {
                    id: item.id || `planet-${index}`,
                    orbitRadius,
                    size,
                    color: cosmicColors[index % cosmicColors.length],
                    speed,
                    moonsCount
                };
            });
        }

        // Синхронизируем новые планеты с уже существующими в планетахRef, чтобы сохранить углы орбитального вращения (без скачков!)
        planetsRef.current = nextPlanets.map(newP => {
            const existing = planetsRef.current.find(p => p.id === newP.id);
            return {
                ...newP,
                angle: existing ? existing.angle : Math.random() * Math.PI * 2
            };
        });
    }, [history]);

    // Анимационный цикл планет в Canvas (активен только до завершения интро)
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let animationFrameId;

        let width = window.innerWidth;
        let height = window.innerHeight;

        // Создаем оффскрин-холст для кэширования статических элементов (туманности + статические звезды)
        const offscreenCanvas = document.createElement('canvas');
        const offscreenCtx = offscreenCanvas.getContext('2d');

        // Инициализируем два набора звезд (30 статических на оффскрине, 10 мерцающих в цикле)
        const offscreenStars = [];
        for (let i = 0; i < 30; i++) {
            offscreenStars.push({
                x: Math.random(),
                y: Math.random(),
                size: Math.random() * 0.9 + 0.3,
                alpha: 0.15 + Math.random() * 0.45
            });
        }

        const twinklingStars = [];
        for (let i = 0; i < 10; i++) {
            twinklingStars.push({
                x: Math.random(),
                y: Math.random(),
                size: Math.random() * 1.1 + 0.4,
                twinkleSpeed: 0.005 + Math.random() * 0.008,
                phase: Math.random() * Math.PI * 2
            });
        }

        // Настройка размеров под экран (используем DPR=0.75 для баланса производительности)
        const resizeCanvas = () => {
            width = window.innerWidth;
            height = window.innerHeight;
            const dpr = 0.75;
            canvas.width = Math.ceil(width * dpr);
            canvas.height = Math.ceil(height * dpr);

            const scale = 0.25;
            offscreenCanvas.width = Math.ceil(width * scale);
            offscreenCanvas.height = Math.ceil(height * scale);

            const ow = offscreenCanvas.width;
            const oh = offscreenCanvas.height;

            offscreenCtx.clearRect(0, 0, ow, oh);

            // 1. Отрисовка космических туманностей (Nebulas) один раз при инициализации/ресайзе
            offscreenCtx.beginPath();
            const nebula1 = offscreenCtx.createRadialGradient(
                ow * 0.25,
                oh * 0.35,
                0,
                ow * 0.25,
                oh * 0.35,
                ow * 0.45
            );
            nebula1.addColorStop(0, 'rgba(168, 85, 247, 0.075)');
            nebula1.addColorStop(0.5, 'rgba(129, 140, 248, 0.025)');
            nebula1.addColorStop(1, 'rgba(0, 0, 0, 0)');
            offscreenCtx.arc(ow * 0.25, oh * 0.35, ow * 0.45, 0, Math.PI * 2);
            offscreenCtx.fillStyle = nebula1;
            offscreenCtx.fill();

            offscreenCtx.beginPath();
            const nebula2 = offscreenCtx.createRadialGradient(
                ow * 0.75,
                oh * 0.65,
                0,
                ow * 0.75,
                oh * 0.65,
                ow * 0.45
            );
            nebula2.addColorStop(0, 'rgba(45, 212, 191, 0.05)');
            nebula2.addColorStop(0.5, 'rgba(56, 189, 248, 0.015)');
            nebula2.addColorStop(1, 'rgba(0, 0, 0, 0)');
            offscreenCtx.arc(ow * 0.75, oh * 0.65, ow * 0.45, 0, Math.PI * 2);
            offscreenCtx.fillStyle = nebula2;
            offscreenCtx.fill();

            // 2. Отрисовка статических фоновых звезд на оффскрин-холсте
            offscreenStars.forEach(star => {
                offscreenCtx.beginPath();
                offscreenCtx.arc(star.x * ow, star.y * oh, star.size, 0, Math.PI * 2);
                offscreenCtx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
                offscreenCtx.fill();
            });
        };
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        let wobbleAngle = 0;
        const startTime = performance.now();
        let introTriggered = false;

        const drawFrame = (now) => {
            ctx.fillStyle = 'rgba(5, 5, 8, 0.08)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const elapsed = now - startTime;
            const isCompleted = introStateRef.current === 'completed';

            ctx.save();
            const scaleX = canvas.width / width;
            const scaleY = canvas.height / height;
            ctx.scale(scaleX, scaleY);

            // 1. Рисуем статический оффскрин-слой
            ctx.drawImage(offscreenCanvas, 0, 0, width, height);

            // 2. Рисуем мерцающие звезды
            twinklingStars.forEach(star => {
                star.phase += star.twinkleSpeed;
                const alpha = 0.15 + Math.abs(Math.sin(star.phase)) * 0.65;
                ctx.beginPath();
                ctx.arc(star.x * width, star.y * height, star.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                ctx.fill();
            });

            // 3. Космическая левитация
            wobbleAngle += 0.0006;
            const wobbleX = Math.sin(wobbleAngle) * 12;
            const wobbleY = Math.cos(wobbleAngle * 1.3) * 8;

            ctx.save();
            ctx.translate(wobbleX, wobbleY);

            const sunX = width / 2;
            const sunY = height / 2;
            const sunProgress = isCompleted ? 1.0 : Math.min(1.0, elapsed / 1000);

            // 4. Рисуем Солнце
            const sunRadius1 = 140 * sunProgress;
            const sunRadius2 = 90 * sunProgress;
            const sunRadius3 = 45 * sunProgress;
            const sunRadius4 = 20 * sunProgress;

            ctx.beginPath();
            ctx.arc(sunX, sunY, sunRadius1, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(168, 85, 247, ${0.015 * sunProgress})`;
            ctx.fill();

            ctx.beginPath();
            ctx.arc(sunX, sunY, sunRadius2, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(168, 85, 247, ${0.06 * sunProgress})`;
            ctx.fill();

            ctx.beginPath();
            ctx.arc(sunX, sunY, sunRadius3, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(192, 132, 252, ${0.18 * sunProgress})`;
            ctx.fill();

            ctx.beginPath();
            ctx.arc(sunX, sunY, sunRadius4, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(192, 132, 252, ${0.65 * sunProgress})`;
            ctx.fill();

            // 5. Рисуем орбиты и планеты
            planetsRef.current.forEach((planet, index) => {
                let planetProgress = 1.0;
                if (!isCompleted) {
                    const planetDelay = 1000 + index * 250;
                    if (elapsed < planetDelay) {
                        return;
                    }
                    const progress = Math.min(1.0, (elapsed - planetDelay) / 800);
                    planetProgress = 1 - Math.pow(1 - progress, 3);
                }

                ctx.beginPath();
                ctx.arc(sunX, sunY, planet.orbitRadius, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255, 255, 255, ${0.015 * planetProgress})`;
                ctx.lineWidth = 0.8;
                ctx.stroke();

                planet.angle += planet.speed;

                const planetX = sunX + planet.orbitRadius * Math.cos(planet.angle);
                const planetY = sunY + planet.orbitRadius * Math.sin(planet.angle);
                const yOffset = (1 - planetProgress) * 60;

                const auraSize = planet.size * 3.5;
                ctx.beginPath();
                ctx.arc(planetX, planetY + yOffset, auraSize, 0, Math.PI * 2);
                ctx.fillStyle = planet.color;
                ctx.globalAlpha = 0.03 * planetProgress;
                ctx.fill();

                ctx.beginPath();
                ctx.arc(planetX, planetY + yOffset, planet.size * 2.0, 0, Math.PI * 2);
                ctx.fillStyle = planet.color;
                ctx.globalAlpha = 0.12 * planetProgress;
                ctx.fill();

                ctx.beginPath();
                ctx.arc(planetX, planetY + yOffset, planet.size, 0, Math.PI * 2);
                ctx.fillStyle = planet.color;
                ctx.globalAlpha = 0.55 * planetProgress;
                ctx.fill();
                ctx.globalAlpha = 1.0;

                // 6. Рисуем спутники
                for (let j = 0; j < planet.moonsCount; j++) {
                    const moonOrbitRadius = planet.size + 12 + j * 6;
                    const moonAngle = planet.angle * 2.5 + (j * (Math.PI * 2 / planet.moonsCount));

                    const moonX = planetX + moonOrbitRadius * Math.cos(moonAngle);
                    const moonY = (planetY + yOffset) + moonOrbitRadius * Math.sin(moonAngle);

                    ctx.beginPath();
                    ctx.arc(moonX, moonY, 1.8, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(243, 244, 246, ${0.7 * planetProgress})`;
                    ctx.fill();
                }
            });

            ctx.restore();
            ctx.restore();
        };

        const render = () => {
            const now = performance.now();
            drawFrame(now);

            if (introStateRef.current === 'playing' && onIntroCompleteRef.current && !introTriggered) {
                const elapsed = now - startTime;
                const totalIntroDuration = 1000 + (planetsRef.current.length - 1) * 250 + 800;
                if (elapsed >= totalIntroDuration + 100) {
                    introTriggered = true;
                    onIntroCompleteRef.current();
                }
            }

            animationFrameId = requestAnimationFrame(render);
        };
        render();

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            cancelAnimationFrame(animationFrameId);
        };
    }, [introState]);

    // Рассчитываем фоновые свечения в зависимости от количества анализов
    let displayBlobs = [];
    if (readyItems.length === 0) {
        // Дефолтные свечения для нового пользователя
        displayBlobs = [
            { id: 'default-1', color: '#38bdf8', top: '20%', left: '15%', size: '35vmax', delay: '0s' },
            { id: 'default-2', color: '#818cf8', top: '55%', left: '70%', size: '40vmax', delay: '-3s' },
            { id: 'default-3', color: '#34d399', top: '10%', left: '75%', size: '30vmax', delay: '-6s' }
        ];
    } else {
        // Уникальные свечения в зависимости от анализов
        const maxBlobs = 8;
        const itemsToRender = readyItems.slice(0, maxBlobs);
        displayBlobs = itemsToRender.map((item, index) => {
            const pos = glowPositions[index % glowPositions.length];
            const color = cosmicColors[index % cosmicColors.length];
            return {
                id: item.id || `blob-${index}`,
                color,
                ...pos,
                delay: `${index * -2.5}s`
            };
        });
    }

    const isBlurred = introState === 'blurring' || introState === 'completed';
    const showCanvas = introState !== 'completed';
    const showGlows = introState === 'blurring' || introState === 'completed';

    return (
        <>
            {showCanvas && (
                <div className={`solar-system-container ${isBlurred ? 'blurred' : ''}`}>
                    <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
                </div>
            )}

            <div className={`cosmic-glow-container ${showGlows ? 'visible' : ''}`}>
                {displayBlobs.map(blob => (
                    <div
                        key={blob.id}
                        className="cosmic-glow-blob"
                        style={{
                            top: blob.top,
                            left: blob.left,
                            width: blob.size,
                            height: blob.size,
                            backgroundColor: blob.color,
                            boxShadow: `0 0 120px 60px ${blob.color}`,
                            animationDelay: blob.delay
                        }}
                    />
                ))}
            </div>
        </>
    );
};

export default SolarSystemBackground;
