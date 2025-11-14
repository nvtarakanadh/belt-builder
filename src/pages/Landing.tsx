import { Hero } from "@/components/landing/Hero";
import { ConfiguratorPreview } from "@/components/landing/ConfiguratorPreview";
import { BenefitsGrid } from "@/components/landing/BenefitsGrid";
import { WorkflowStrip } from "@/components/landing/WorkflowStrip";
import { SocialProof } from "@/components/landing/SocialProof";
import { TestimonialCarousel } from "@/components/landing/TestimonialCarousel";
import { FAQ } from "@/components/landing/FAQ";
import { Footer } from "@/components/landing/Footer";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <Hero />
      <ConfiguratorPreview />
      <BenefitsGrid />
      <WorkflowStrip />
      <SocialProof />
      <TestimonialCarousel />
      <FAQ />
      <Footer />
    </div>
  );
}

