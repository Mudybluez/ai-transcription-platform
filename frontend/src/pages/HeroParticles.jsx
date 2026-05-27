import React, { useEffect, useRef } from 'react';

export default function HeroParticles({ triggerRef, density = 130, accent = '#8AB4F8', braceOnHover = true }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let running = true;
        let animationFrameId;

        let w = 0;
        let h = 0;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        let particles = [];
        let target = null;
        let formProgress = 0;
        let formDir = -1;
        let lastT = performance.now();

        // Helpers
        const withAlpha = (color, a) => {
            if (color.startsWith('#')) {
                const r = parseInt(color.slice(1, 3), 16);
                const g = parseInt(color.slice(3, 5), 16);
                const b = parseInt(color.slice(5, 7), 16);
                return `rgba(${r},${g},${b},${a})`;
            }
            return color;
        };

        const ease = (t) => {
            return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        };

        const brace = (x, y, height, flip) => {
            const pts = [];
            const N = 32;
            const half = height / 2;
            const armDepth = Math.min(14, height * 0.07);
            const curl = Math.min(10, height * 0.06);
            for (let i = 0; i < N; i++) {
                const t = i / (N - 1);
                const ty = y - half + t * height;
                const phase = (t - 0.5) * Math.PI;
                
                const hook = (t < 0.08) ? (1 - t / 0.08) * curl :
                             (t > 0.92) ? ((t - 0.92) / 0.08) * curl : 0;
                const pointer = Math.cos(phase) > 0.85 ? armDepth * (Math.cos(phase) - 0.85) / 0.15 : 0;
                const depth = hook + pointer + 2;
                const tx = x + (flip ? depth : -depth);
                pts.push({ x: tx, y: ty });
            }
            return pts;
        };

        const buildBraceTargets = () => {
            if (!triggerRef || !triggerRef.current || !canvas) {
                target = null;
                return;
            }
            const hostRect = canvas.getBoundingClientRect();
            const trgRect = triggerRef.current.getBoundingClientRect();
            
            const cx = trgRect.left - hostRect.left + trgRect.width / 2;
            const cy = trgRect.top - hostRect.top + trgRect.height / 2;
            
            const braceH = trgRect.height * 0.92;
            const gap = trgRect.width * 0.55 + 8;
            
            const left = brace(cx - gap, cy, braceH, false);
            const right = brace(cx + gap, cy, braceH, true);
            target = { left, right };
        };

        const spawn = () => {
            return {
                x: Math.random() * w,
                y: Math.random() * h,
                vx: (Math.random() - 0.5) * 0.08,
                vy: (Math.random() - 0.5) * 0.08,
                r: Math.random() * 1.2 + 0.4,
                hue: Math.random() < 0.15 ? 'accent' : 'white',
                alphaBase: Math.random() * 0.4 + 0.25,
                twinkle: Math.random() * Math.PI * 2,
            };
        };

        const seed = () => {
            particles = [];
            for (let i = 0; i < density; i++) {
                particles.push(spawn());
            }
        };

        const resize = () => {
            const rect = canvas.getBoundingClientRect();
            w = rect.width;
            h = rect.height;
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            
            buildBraceTargets();
        };

        const tick = (now) => {
            if (!running) return;
            const dt = Math.min(40, now - lastT);
            lastT = now;

            ctx.clearRect(0, 0, w, h);

            // form progress easing
            const speed = dt / 600; // ~0.6s full
            formProgress = Math.max(0, Math.min(1, formProgress + formDir * speed));
            const eased = ease(formProgress);

            const useTarget = target && formProgress > 0.001;
            const totalTargets = useTarget ? target.left.length + target.right.length : 0;

            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                
                // idle drift
                p.x += p.vx * dt;
                p.y += p.vy * dt;

                // wrap bounds
                if (p.x < -20) p.x = w + 20;
                if (p.x > w + 20) p.x = -20;
                if (p.y < -20) p.y = h + 20;
                if (p.y > h + 20) p.y = -20;

                let drawX = p.x;
                let drawY = p.y;
                let onBrace = false;

                if (useTarget && i < totalTargets) {
                    const tNode = i < target.left.length ? target.left[i] : target.right[i - target.left.length];
                    drawX = p.x + (tNode.x - p.x) * eased;
                    drawY = p.y + (tNode.y - p.y) * eased;
                    onBrace = eased > 0.6;
                }

                p.twinkle += dt * 0.003;
                const tw = 0.7 + 0.3 * Math.sin(p.twinkle);
                const alpha = p.alphaBase * tw;
                const color = onBrace ? accent : (p.hue === 'accent' ? accent : '#FFFFFF');

                ctx.beginPath();
                ctx.fillStyle = withAlpha(color, alpha);
                ctx.arc(drawX, drawY, p.r * (onBrace ? 1.4 : 1), 0, Math.PI * 2);
                ctx.fill();

                if (onBrace) {
                    // small glow around brace particles
                    ctx.beginPath();
                    ctx.fillStyle = withAlpha(accent, 0.12 * tw);
                    ctx.arc(drawX, drawY, p.r * 4, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            animationFrameId = requestAnimationFrame(tick);
        };

        // Event listeners
        const handleMouseEnter = () => {
            if (braceOnHover) formDir = 1;
        };
        const handleMouseLeave = () => {
            if (braceOnHover) formDir = -1;
        };

        // Initialize
        resize();
        seed();
        window.addEventListener('resize', resize);
        
        let triggerEl = null;
        if (triggerRef && triggerRef.current) {
            triggerEl = triggerRef.current;
            triggerEl.addEventListener('mouseenter', handleMouseEnter);
            triggerEl.addEventListener('mouseleave', handleMouseLeave);
        }

        // Re-measure after font load (as layout titles might shift width)
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(resize);
        }

        animationFrameId = requestAnimationFrame(tick);

        return () => {
            running = false;
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', resize);
            if (triggerEl) {
                triggerEl.removeEventListener('mouseenter', handleMouseEnter);
                triggerEl.removeEventListener('mouseleave', handleMouseLeave);
            }
        };
    }, [triggerRef, density, accent, braceOnHover]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 1
            }}
        />
    );
}
