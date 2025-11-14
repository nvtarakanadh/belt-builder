import { Upload, Settings, Download } from "lucide-react";
import { WorkflowStep } from "./WorkflowStep";

const STEPS = [
  {
    step: 1,
    icon: Upload,
    title: "Upload Components",
    description: "Add your CAD files or choose from our extensive component library.",
  },
  {
    step: 2,
    icon: Settings,
    title: "Configure & Arrange",
    description: "Drag and drop components, adjust dimensions, and position them in 3D space.",
  },
  {
    step: 3,
    icon: Download,
    title: "Export & Share",
    description: "Download your design, generate BOMs, or share with your team.",
  },
];

export const WorkflowStrip = () => {
  return (
    <section className="py-20 px-4 bg-card/30">
      <div className="container mx-auto max-w-4xl">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl md:text-5xl font-bold">Simple 3-Step Workflow</h2>
          <p className="text-xl text-muted-foreground">
            From concept to production in minutes.
          </p>
        </div>

        <div className="space-y-8">
          {STEPS.map((step, index) => (
            <WorkflowStep
              key={step.step}
              step={step.step}
              icon={step.icon}
              title={step.title}
              description={step.description}
              delay={index * 0.1}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

