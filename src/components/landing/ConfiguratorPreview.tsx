import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const PRESETS = [
  { id: 1, name: "Standard Belt", length: "5m", width: "500mm" },
  { id: 2, name: "Heavy Duty", length: "10m", width: "800mm" },
  { id: 3, name: "Compact", length: "3m", width: "300mm" },
];

export const ConfiguratorPreview = () => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [selectedPreset, setSelectedPreset] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const rotationRef = useRef(0);
  const navigate = useNavigate();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      if (!isPlaying) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw grid
      ctx.strokeStyle = "rgba(161, 168, 179, 0.1)";
      ctx.lineWidth = 1;
      for (let i = 0; i < canvas.width; i += 50) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
      }
      for (let i = 0; i < canvas.height; i += 50) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
      }

      // Draw 3D conveyor belt (simplified representation)
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotationRef.current * Math.PI) / 180);

      // Belt surface
      ctx.fillStyle = "rgba(46, 229, 157, 0.2)";
      ctx.fillRect(-200, -50, 400, 100);

      // Belt frame
      ctx.strokeStyle = "rgba(230, 233, 239, 0.6)";
      ctx.lineWidth = 2;
      ctx.strokeRect(-200, -50, 400, 100);

      // Support legs
      ctx.fillStyle = "rgba(230, 233, 239, 0.4)";
      ctx.fillRect(-180, 50, 20, 60);
      ctx.fillRect(160, 50, 20, 60);

      ctx.restore();

      rotationRef.current += 0.5;
      if (rotationRef.current >= 360) {
        rotationRef.current = 0;
      }

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  return (
    <section className="py-20 px-4 bg-card/30">
      <div className="container mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center space-y-8"
        >
          <h2 className="text-4xl md:text-5xl font-bold">Interactive 3D Configurator</h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Visualize your conveyor system in real-time. Rotate, zoom, and customize every detail.
          </p>

          <div className="relative rounded-2xl overflow-hidden shadow-soft-lg bg-card border border-border">
            <div
              className="relative aspect-video bg-background"
              onMouseEnter={() => setIsPlaying(false)}
              onMouseLeave={() => setIsPlaying(true)}
            >
              <canvas
                ref={canvasRef}
                className="w-full h-full"
                style={{ display: "block" }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-4 rounded-full bg-accent/20 backdrop-blur-sm border border-accent/30"
                  aria-label={isPlaying ? "Pause animation" : "Play animation"}
                >
                  {isPlaying ? (
                    <Pause className="h-8 w-8 text-accent" />
                  ) : (
                    <Play className="h-8 w-8 text-accent" />
                  )}
                </motion.button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex flex-wrap gap-2 justify-center">
                {PRESETS.map((preset) => (
                  <Badge
                    key={preset.id}
                    variant={selectedPreset === preset.id ? "default" : "outline"}
                    className="cursor-pointer px-4 py-2"
                    onClick={() => setSelectedPreset(preset.id)}
                  >
                    {preset.name} • {preset.length} × {preset.width}
                  </Badge>
                ))}
              </div>

              <Button
                size="lg"
                onClick={() => navigate("/builder/demo?readonly=1")}
                className="w-full sm:w-auto mx-auto bg-accent text-accent-foreground hover:bg-accent/90"
              >
                Open Configurator
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

