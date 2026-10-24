"use client";

import ScrollBackground from "@/components/landing/scroll-bg";
import Nav from "@/components/landing/nav";
import Hero from "@/components/landing/hero";
import Marquee from "@/components/landing/marquee";
import Features from "@/components/landing/features";
import HowItWorks from "@/components/landing/how-it-works";
import ChatDemo from "@/components/landing/chat-demo";
import Stats from "@/components/landing/stats";
import Faq from "@/components/landing/faq";
import Cta from "@/components/landing/cta";
import Footer from "@/components/landing/footer";
import ChatApp from "@/components/chat/chat-app";

export default function Home() {
  return (
    <ScrollBackground>
      <div className="grain relative">
        <Nav />
        <main>
          <Hero />
          <Marquee />
          <Features />
          <HowItWorks />
          <ChatDemo />
          <Stats />
          <Faq />
          <Cta />
        </main>
        <Footer />
        <ChatApp />
      </div>
    </ScrollBackground>
  );
}
