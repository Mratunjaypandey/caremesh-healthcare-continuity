'use client';

import { useEffect, useState } from 'react';

function getGreeting(date: Date) {
  const hour = date.getHours();
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}

export function TimeGreeting({ name }: { name: string }) {
  const [label, setLabel] = useState('Welcome back');

  useEffect(() => {
    const update = () => setLabel(getGreeting(new Date()));
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return <>{label}, {name.split(' ')[0]}.</>;
}
