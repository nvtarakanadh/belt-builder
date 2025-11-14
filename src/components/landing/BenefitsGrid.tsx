import { Zap, Layers, Settings } from "lucide-react";
import { BenefitCard } from "./BenefitCard";

const BENEFITS = [
  {
    icon: Zap,
    title: "Lightning Fast",
    description:
      "Build complex conveyor systems in minutes, not hours. Our intuitive interface makes design effortless.",
  },
  {
    icon: Layers,
    title: "Component Library",
    description:
      "Access hundreds of pre-configured components. Belts, motors, frames, and more at your fingertips.",
  },
  {
    icon: Settings,
    title: "Real-time Preview",
    description:
      "See your design come to life instantly. Rotate, zoom, and inspect every detail in 3D before building.",
  },
];

export const BenefitsGrid = () => {
  return (
    <section className="py-20 px-4">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl md:text-5xl font-bold">Why Choose Our Builder?</h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Everything you need to design professional conveyor belt systems.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {BENEFITS.map((benefit, index) => (
            <BenefitCard
              key={benefit.title}
              icon={benefit.icon}
              title={benefit.title}
              description={benefit.description}
              delay={index * 0.1}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

