import React, { useEffect, useRef } from 'react';

/**
 * GalaxyCanvas — Motor 3D de Partículas Galácticas em Canvas
 * 
 * Implementa galáxia espiral em 3D com rotação orbital, projeção em perspectiva,
 * física interativa de atração e repulsão ao passar o cursor, e modo Eco-Mode
 * pausando automaticamente via `document.hidden` para economia de CPU/bateria.
 */
export default function GalaxyCanvas({
  particleCount = 2200,
  interactive = true,
  opacity = 1.0,
  fadeEdges = false,
  className = '',
  canvasClassName = '',
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let animationFrameId;
    let isPaused = false;

    // Ajusta contagem para telas móveis para preservar performance cravada a 60 FPS
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const actualParticleCount = isMobile ? Math.min(particleCount, 700) : particleCount;

    // Estado do mouse
    const mouse = {
      x: -1000,
      y: -1000,
      active: false,
      targetTiltX: 0,
      targetTiltY: 0,
      currentTiltX: 0,
      currentTiltY: 0,
    };

    // Atualiza dimensões físicas do Canvas
    // Atualiza dimensões físicas do Canvas com suporte estrito a HiDPI / Retina (nitidez cristalina)
    const resizeCanvas = () => {
      if (!container || !canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2); // Limita a 2x para equilibrar nitidez e consumo
      const rect = container.getBoundingClientRect();
      width = rect.width || container.clientWidth || 400;
      height = rect.height || container.clientHeight || 400;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
    };
    resizeCanvas();

    // Paleta Esmeralda / Cyberpunk (#10b981, #34d399, #6ee7b7, #059669, #a7f3d0)
    const colorPalette = [
      { r: 16, g: 185, b: 129 }, // Emerald 500
      { r: 52, g: 211, b: 153 }, // Emerald 400
      { r: 110, g: 231, b: 183 }, // Emerald 300
      { r: 167, g: 243, b: 208 }, // Emerald 200 (brilho central)
      { r: 5, g: 150, b: 105 },  // Emerald 600
      { r: 4, g: 120, b: 87 },   // Emerald 700 (rim externo)
    ];

    // Geração de partículas da Galáxia Espiral 3D
    const numArms = 3;
    const armSeparation = (Math.PI * 2) / numArms;
    const maxRadius = Math.max(width, height) * 0.48 || 320;
    const particles = [];

    for (let i = 0; i < actualParticleCount; i++) {
      const isCore = Math.random() < 0.2; // 20% no núcleo denso
      let r, theta, z, colorObj, size;

      if (isCore) {
        r = Math.pow(Math.random(), 1.5) * (maxRadius * 0.25);
        theta = Math.random() * Math.PI * 2;
        z = (Math.random() - 0.5) * (maxRadius * 0.18);
        // Núcleo mais brilhante
        colorObj = Math.random() < 0.6 ? colorPalette[3] : colorPalette[1];
        size = Math.random() * 1.6 + 0.8;
      } else {
        const armIndex = i % numArms;
        const armOffset = armIndex * armSeparation;
        r = (Math.random() * 0.85 + 0.15) * maxRadius;
        
        // Curvatura espiral logarítmica com dispersão
        const spiralFactor = 0.0075;
        const dispersion = (Math.random() - 0.5) * 0.55 * (r / maxRadius);
        theta = r * spiralFactor + armOffset + dispersion;
        
        // Espessura no plano Z diminui conforme afasta do centro
        const zSpread = Math.max(10, (1 - r / maxRadius) * 60);
        z = (Math.random() - 0.5) * zSpread;
        
        // Seleciona cor baseada na distância
        const colorIdx = Math.floor((r / maxRadius) * (colorPalette.length - 1));
        colorObj = colorPalette[Math.min(colorIdx, colorPalette.length - 1)];
        size = Math.random() * 1.4 + 0.6;
      }

      // Velocidade orbital angular (Kepleriana aproximada)
      const orbitalSpeed = (0.0035 + (1 / (r + 40)) * 0.12) * (Math.random() * 0.4 + 0.8);

      particles.push({
        r,
        theta,
        z,
        baseZ: z,
        color: colorObj,
        colorRgb: `${colorObj.r}, ${colorObj.g}, ${colorObj.b}`,
        baseSize: size,
        speed: orbitalSpeed,
        alpha: Math.random() * 0.65 + 0.35,
        // Deslocamento de física (atração/repulsão do mouse)
        dx: 0,
        dy: 0,
        vx: 0,
        vy: 0,
      });
    }

    // Parâmetros da Câmera 3D
    const fov = 450;
    const baseCameraTiltX = 58 * (Math.PI / 180); // 58 graus de inclinação para visão isométrica/perspectiva
    let galaxyRotation = 0;

    // Listeners do Mouse para Coluna Esquerda
    const handleMouseMove = (e) => {
      if (!interactive) return;
      const rect = container.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.active = true;

      // Inclinação suave da câmera no mouse move (-0.15 a +0.15 radianos)
      const nx = (mouse.x / width - 0.5) * 2;
      const ny = (mouse.y / height - 0.5) * 2;
      mouse.targetTiltX = ny * 0.18;
      mouse.targetTiltY = nx * 0.22;
    };

    const handleMouseLeave = () => {
      mouse.active = false;
      mouse.targetTiltX = 0;
      mouse.targetTiltY = 0;
    };

    container.addEventListener('mousemove', handleMouseMove, { passive: true });
    container.addEventListener('mouseleave', handleMouseLeave, { passive: true });

    // Eco-Mode: Pausa a renderização quando a aba do navegador perde visibilidade
    const handleVisibilityChange = () => {
      if (document.hidden) {
        isPaused = true;
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
      } else {
        if (isPaused) {
          isPaused = false;
          animationFrameId = requestAnimationFrame(renderLoop);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // ResizeObserver para redimensionamento responsivo perfeito
    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });
    resizeObserver.observe(container);

    // Constantes pré-calculadas para eliminação de overhead no loop
    const interactionRadius = 150;
    const interactionRadiusSq = 22500; // 150 * 150
    const repelRadiusSq = 3025; // 55 * 55
    const invInteractionRadius = 1 / 150;
    const TWO_PI = Math.PI * 2;

    // Loop de Renderização 60/120 FPS
    const renderLoop = () => {
      if (isPaused || document.hidden) return;

      // Limpeza com fundo escuro profundo #050a08
      ctx.fillStyle = '#050a08';
      ctx.fillRect(0, 0, width, height);

      const centerX = width * 0.5;
      const centerY = height * 0.5;

      // Interpolação suave de tilt da câmera (amortecimento elástico)
      mouse.currentTiltX += (mouse.targetTiltX - mouse.currentTiltX) * 0.05;
      mouse.currentTiltY += (mouse.targetTiltY - mouse.currentTiltY) * 0.05;

      const tiltX = baseCameraTiltX + mouse.currentTiltX;
      const tiltY = mouse.currentTiltY;

      // Rotação contínua da galáxia
      galaxyRotation += 0.0012;

      // OTIMIZAÇÃO CRÍTICA: pré-calcula trigonométricas da galáxia e da câmera FORA do loop das partículas!
      const rotCos = Math.cos(galaxyRotation);
      const rotSin = Math.sin(galaxyRotation);
      const cosX = Math.cos(tiltX);
      const sinX = Math.sin(tiltX);
      const cosY = Math.cos(tiltY);
      const sinY = Math.sin(tiltY);

      // Renderiza as partículas com mesclagem aditiva sutil
      ctx.globalCompositeOperation = 'lighter';

      const isMouseActive = interactive && mouse.active;
      const mouseX = mouse.x;
      const mouseY = mouse.y;

      for (let i = 0; i < actualParticleCount; i++) {
        const p = particles[i];

        // Atualiza ângulo orbital
        p.theta += p.speed;

        // Posição local 3D no disco da galáxia
        const lx = Math.cos(p.theta) * p.r;
        const ly = Math.sin(p.theta) * p.r;
        const lz = p.z;

        // Efeito de física com mouse (Atração e Repulsão)
        if (isMouseActive) {
          // Amortecimento do deslocamento físico
          p.vx *= 0.90;
          p.vy *= 0.90;
          p.dx += p.vx;
          p.dy += p.vy;
          // Retorno elástico à posição orbital nativa
          p.dx *= 0.92;
          p.dy *= 0.92;
        }

        // Rotação galáctica no plano Z (utilizando rotCos e rotSin pré-computados)
        const rx = lx * rotCos - ly * rotSin + p.dx;
        const ry = lx * rotSin + ly * rotCos + p.dy;
        const rz = lz;

        // Rotação de câmera: Eixo Y
        const x1 = rx * cosY + rz * sinY;
        const y1 = ry;
        const z1 = -rx * sinY + rz * cosY;

        // Rotação de câmera: Eixo X
        const x3D = x1;
        const y3D = y1 * cosX - z1 * sinX;
        const z3D = y1 * sinX + z1 * cosX;

        // Projeção em Perspectiva
        const cameraDist = fov + z3D;
        if (cameraDist <= 10) continue; // Atrás da câmera

        const scale = fov / cameraDist;
        const screenX = centerX + x3D * scale;
        const screenY = centerY + y3D * scale;

        // Interação de Mouse ultra-otimizada: verificação estrita por distâncias ao quadrado
        if (isMouseActive) {
          const distX = screenX - mouseX;
          const distY = screenY - mouseY;
          const distSq = distX * distX + distY * distY;

          // Evita Math.sqrt em 99% das partículas fora do raio de 150px
          if (distSq < interactionRadiusSq && distSq > 1) {
            const dist = Math.sqrt(distSq);
            const forceNorm = (interactionRadius - dist) * invInteractionRadius;
            const invDist = 1 / dist;
            const normX = distX * invDist;
            const normY = distY * invDist;

            if (distSq < repelRadiusSq) {
              // Repulsão rápida no núcleo do cursor
              const repelForce = forceNorm * 4.2;
              p.vx += normX * repelForce;
              p.vy += normY * repelForce;
            } else {
              // Atração gravitacional suave no anel médio
              const attractForce = forceNorm * 1.5;
              p.vx -= normX * attractForce;
              p.vy -= normY * attractForce;
            }

            // Turbulência tangencial suave (redemoinho ao redor do mouse)
            const swirlForce = 0.8 * forceNorm;
            p.vx -= normY * swirlForce;
            p.vy += normX * swirlForce;
          }
        }

        // Cálculo de tamanho e opacidade finais
        const radius = Math.max(0.3, p.baseSize * scale);
        const depthAlpha = Math.min(1.0, Math.max(0.15, (scale * 0.9)));
        const finalAlpha = p.alpha * depthAlpha * opacity;

        // Desenha partícula
        ctx.beginPath();
        ctx.arc(screenX, screenY, radius, 0, TWO_PI);
        ctx.fillStyle = `rgba(${p.colorRgb}, ${finalAlpha})`;
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';
      animationFrameId = requestAnimationFrame(renderLoop);
    };

    // Inicia o loop
    renderLoop();

    // Limpeza rigorosa no desmonte do componente (Zero memory leaks)
    return () => {
      isPaused = true;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      resizeObserver.disconnect();
    };
  }, [particleCount, interactive, opacity]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden bg-[#050a08] ${className}`}
    >
      <canvas
        ref={canvasRef}
        id="galaxy-canvas"
        className={`block w-full h-full ${
          fadeEdges
            ? '[mask-image:linear-gradient(to_bottom,black_70%,transparent_100%)] md:[mask-image:linear-gradient(to_right,black_70%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_70%,transparent_100%)] md:[-webkit-mask-image:linear-gradient(to_right,black_70%,transparent_100%)]'
            : ''
        } ${canvasClassName}`}
        style={{ opacity }}
      />
    </div>
  );
}
