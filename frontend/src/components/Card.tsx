import React from 'react'

export const Card = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
    <div className={`rounded-lg border shadow-sm ${className}`}>
        {children}
    </div>
)

export const CardHeader = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
    <div className={`p-6 border-b ${className}`}>
        {children}
    </div>
)

export const CardContent = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
    <div className={`p-6 ${className}`}>
        {children}
    </div>
)
