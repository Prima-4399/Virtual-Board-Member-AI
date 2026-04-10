'use client'

import { useState, useEffect } from 'react'

export default function ThemeToggle() {
    const [isDark, setIsDark] = useState(false)

    useEffect(() => {
        // Initialize theme from localStorage or system preference
        const savedTheme = localStorage.getItem('theme')
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches

        if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
            setIsDark(true)
            document.documentElement.classList.add('dark')
        }
    }, [])

    const toggleTheme = () => {
        if (isDark) {
            document.documentElement.classList.remove('dark')
            localStorage.setItem('theme', 'light')
            setIsDark(false)
        } else {
            document.documentElement.classList.add('dark')
            localStorage.setItem('theme', 'dark')
            setIsDark(true)
        }
    }

    return (
        <button
            onClick={toggleTheme}
            className="flex items-center gap-3 px-4 py-2 bg-surface-low border border-muted/10 rounded-full hover:bg-surface-high transition-all active:scale-95 group shadow-sm"
            aria-label="Toggle Theme"
        >
            <div className="relative w-10 h-5 bg-muted/20 rounded-full p-1 transition-colors group-hover:bg-muted/30 flex items-center">
                <div className={`absolute w-3 h-3 rounded-full transition-all duration-300 transform flex items-center justify-center ${isDark ? 'translate-x-5 bg-primary' : 'translate-x-0 bg-secondary'}`}>
                    <i className={`fas ${isDark ? 'fa-moon text-[6px]' : 'fa-sun text-[6px]'} text-white`}></i>
                </div>
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-muted group-hover:text-foreground transition-colors">
                {isDark ? 'Slate Ink' : 'Sandstone'}
            </span>
        </button>
    )
}
