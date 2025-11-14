import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Quote, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const TESTIMONIALS = [
  {
    id: 1,
    name: "Sarah Chen",
    role: "Engineering Manager",
    company: "TechManufacturing Inc.",
    content:
      "This tool has revolutionized how we design conveyor systems. The 3D preview saves us hours of back-and-forth with clients.",
    avatar: "SC",
  },
  {
    id: 2,
    name: "Michael Rodriguez",
    role: "Lead Designer",
    company: "Industrial Solutions Co.",
    content:
      "The component library is extensive and the interface is intuitive. Our team adopted it immediately.",
    avatar: "MR",
  },
  {
    id: 3,
    name: "Emily Watson",
    role: "Project Manager",
    company: "Automation Systems Ltd.",
    content:
      "Being able to visualize and share designs in real-time has improved our client communication significantly.",
    avatar: "EW",
  },
];

export const TestimonialCarousel = () => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % TESTIMONIALS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const next = () => {
    setCurrentIndex((prev) => (prev + 1) % TESTIMONIALS.length);
  };

  const prev = () => {
    setCurrentIndex((prev) => (prev - 1 + TESTIMONIALS.length) % TESTIMONIALS.length);
  };

  return (
    <section className="py-20 px-4">
      <div className="container mx-auto max-w-4xl">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl md:text-5xl font-bold">Trusted by Industry Leaders</h2>
          <p className="text-xl text-muted-foreground">
            See what our customers are saying.
          </p>
        </div>

        <div className="relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.3 }}
              className="p-8 md:p-12 rounded-2xl bg-card border border-border shadow-soft"
            >
              <Quote className="h-8 w-8 text-accent mb-6" />
              <p className="text-lg md:text-xl text-foreground mb-8 leading-relaxed">
                {TESTIMONIALS[currentIndex].content}
              </p>
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-accent/10 text-accent font-bold">
                  {TESTIMONIALS[currentIndex].avatar}
                </div>
                <div>
                  <p className="font-bold">{TESTIMONIALS[currentIndex].name}</p>
                  <p className="text-sm text-muted-foreground">
                    {TESTIMONIALS[currentIndex].role} at {TESTIMONIALS[currentIndex].company}
                  </p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center justify-center gap-4 mt-8">
            <Button
              variant="outline"
              size="icon"
              onClick={prev}
              aria-label="Previous testimonial"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="flex gap-2">
              {TESTIMONIALS.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentIndex(index)}
                  className={`h-2 rounded-full transition-all ${
                    index === currentIndex
                      ? "w-8 bg-accent"
                      : "w-2 bg-muted-foreground/30"
                  }`}
                  aria-label={`Go to testimonial ${index + 1}`}
                />
              ))}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={next}
              aria-label="Next testimonial"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

