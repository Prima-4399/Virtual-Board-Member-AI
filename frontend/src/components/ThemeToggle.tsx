"use client";

import { useTheme } from './ThemeProvider';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
    try {
        const { theme, toggleTheme } = useTheme();

        return (
            <button
                onClick={toggleTheme}
                className="p-2.5 rounded-xl border border-border bg-surface-highest/20 hover:bg-primary/10 hover:text-primary text-foreground/40 transition-all group flex items-center justify-center"
                title={theme === 'light' ? 'Switch to Midnight Archive' : 'Switch to Traditional Paper'}
            >
                {theme === 'light' ? (
                    <Moon className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                ) : (
                    <Sun className="w-5 h-5 group-hover:rotate-45 transition-transform" />
                )}
            </button>
        );
    } catch {
        return null;
    }
}
