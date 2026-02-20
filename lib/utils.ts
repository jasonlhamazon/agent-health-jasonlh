/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Difficulty, DateFormatVariant } from "@/types"
import { DEFAULT_CONFIG } from "@/lib/constants"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ==================== Label Styling ====================

// Special colors for difficulty labels only
// Light mode: subtle backgrounds with darker text
// Dark mode: darker backgrounds with lighter text
const DIFFICULTY_LABEL_COLORS: Record<string, string> = {
  'difficulty:Easy': 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-opensearch-blue dark:border-blue-800',
  'difficulty:Medium': 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800',
  'difficulty:Hard': 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
};

// Aggro-style-edit: Inline styles for labels (theme-aware)
const DIFFICULTY_LABEL_STYLES: Record<string, { light: React.CSSProperties; dark: React.CSSProperties }> = {
  'difficulty:Easy': {
    light: { backgroundColor: 'rgb(219, 234, 254)', color: 'rgb(30, 64, 175)', border: '1px solid rgb(147, 197, 253)' },
    dark: { backgroundColor: 'rgba(59, 130, 246, 0.15)', color: 'rgb(96, 165, 250)', border: '1px solid rgba(59, 130, 246, 0.4)' }
  },
  'difficulty:Medium': {
    light: { backgroundColor: 'rgb(254, 243, 199)', color: 'rgb(146, 64, 14)', border: '1px solid rgb(252, 211, 77)' },
    dark: { backgroundColor: 'rgba(234, 179, 8, 0.15)', color: 'rgb(250, 204, 21)', border: '1px solid rgba(234, 179, 8, 0.4)' }
  },
  'difficulty:Hard': {
    light: { backgroundColor: 'rgb(254, 226, 226)', color: 'rgb(153, 27, 27)', border: '1px solid rgb(252, 165, 165)' },
    dark: { backgroundColor: 'rgba(239, 68, 68, 0.15)', color: 'rgb(248, 113, 113)', border: '1px solid rgba(239, 68, 68, 0.4)' }
  }
};

// Generic label styles palette (theme-aware)
const LABEL_STYLE_PALETTE: Array<{ light: React.CSSProperties; dark: React.CSSProperties }> = [
  {
    light: { backgroundColor: 'rgb(219, 234, 254)', color: 'rgb(30, 64, 175)', border: '1px solid rgb(147, 197, 253)' },
    dark: { backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'rgb(147, 197, 253)', border: '1px solid rgba(59, 130, 246, 0.3)' }
  },
  {
    light: { backgroundColor: 'rgb(243, 232, 255)', color: 'rgb(107, 33, 168)', border: '1px solid rgb(216, 180, 254)' },
    dark: { backgroundColor: 'rgba(168, 85, 247, 0.15)', color: 'rgb(192, 132, 252)', border: '1px solid rgba(168, 85, 247, 0.4)' }
  },
  {
    light: { backgroundColor: 'rgb(207, 250, 254)', color: 'rgb(21, 94, 117)', border: '1px solid rgb(165, 243, 252)' },
    dark: { backgroundColor: 'rgba(6, 182, 212, 0.15)', color: 'rgb(103, 232, 249)', border: '1px solid rgba(6, 182, 212, 0.4)' }
  },
  {
    light: { backgroundColor: 'rgb(252, 231, 243)', color: 'rgb(157, 23, 77)', border: '1px solid rgb(249, 168, 212)' },
    dark: { backgroundColor: 'rgba(236, 72, 153, 0.15)', color: 'rgb(244, 114, 182)', border: '1px solid rgba(236, 72, 153, 0.4)' }
  },
  {
    light: { backgroundColor: 'rgb(255, 237, 213)', color: 'rgb(154, 52, 18)', border: '1px solid rgb(253, 186, 116)' },
    dark: { backgroundColor: 'rgba(249, 115, 22, 0.15)', color: 'rgb(251, 146, 60)', border: '1px solid rgba(249, 115, 22, 0.4)' }
  },
  {
    light: { backgroundColor: 'rgb(204, 251, 241)', color: 'rgb(19, 78, 74)', border: '1px solid rgb(153, 246, 228)' },
    dark: { backgroundColor: 'rgba(20, 184, 166, 0.15)', color: 'rgb(94, 234, 212)', border: '1px solid rgba(20, 184, 166, 0.4)' }
  },
  {
    light: { backgroundColor: 'rgb(224, 231, 255)', color: 'rgb(55, 48, 163)', border: '1px solid rgb(165, 180, 252)' },
    dark: { backgroundColor: 'rgba(99, 102, 241, 0.15)', color: 'rgb(129, 140, 248)', border: '1px solid rgba(99, 102, 241, 0.4)' }
  },
  {
    light: { backgroundColor: 'rgb(243, 244, 246)', color: 'rgb(55, 65, 81)', border: '1px solid rgb(209, 213, 219)' },
    dark: { backgroundColor: 'rgba(107, 114, 128, 0.1)', color: 'rgb(156, 163, 175)', border: '1px solid rgba(107, 114, 128, 0.3)' }
  }
];

/**
 * Returns inline styles for label badges (aggro-style-edit, theme-aware)
 * Only difficulty:Easy/Medium/Hard get special colors; all others use hash-based palette
 */
export const getLabelStyle = (label: string, isDarkMode: boolean): React.CSSProperties => {
  // Check exact match for difficulty labels
  if (DIFFICULTY_LABEL_STYLES[label]) {
    return isDarkMode ? DIFFICULTY_LABEL_STYLES[label].dark : DIFFICULTY_LABEL_STYLES[label].light;
  }

  // All other labels use hash-based color assignment for consistency
  const hash = label.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const palette = LABEL_STYLE_PALETTE[hash % LABEL_STYLE_PALETTE.length];
  return isDarkMode ? palette.dark : palette.light;
};

// Generic label color palette (used for all other labels, hash-based)
// OpenSearch UI inspired colors for light mode
const LABEL_COLOR_PALETTE = [
  'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700',
  'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800',
  'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-900/30 dark:text-cyan-400 dark:border-cyan-800',
  'bg-pink-100 text-pink-800 border-pink-300 dark:bg-pink-900/30 dark:text-pink-400 dark:border-pink-800',
  'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800',
  'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800',
  'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800',
  'bg-gray-100 text-gray-800 border-gray-300 dark:bg-muted dark:text-muted-foreground dark:border-border',
];

/**
 * Returns Tailwind classes for styling label badges
 * Only difficulty:Easy/Medium/Hard get special colors; all others use hash-based palette
 */
export const getLabelColor = (label: string): string => {
  // Check exact match for difficulty labels
  if (DIFFICULTY_LABEL_COLORS[label]) {
    return DIFFICULTY_LABEL_COLORS[label];
  }

  // All other labels use hash-based color assignment for consistency
  const hash = label.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return LABEL_COLOR_PALETTE[hash % LABEL_COLOR_PALETTE.length];
};

// Mapping from difficulty value to full label for backward compat
const DIFFICULTY_VALUE_COLORS: Record<string, string> = {
  'Easy': 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-opensearch-blue dark:border-blue-800',
  'Medium': 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800',
  'Hard': 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
};

/**
 * Returns Tailwind classes for styling difficulty badges
 * @deprecated Use getLabelColor with difficulty: prefixed labels instead
 */
export const getDifficultyColor = (difficulty: Difficulty): string => {
  return DIFFICULTY_VALUE_COLORS[difficulty] || DIFFICULTY_VALUE_COLORS['Medium'];
};

// ==================== Date Formatting ====================

/**
 * Formats a timestamp string to a localized date string
 * @param timestamp - ISO timestamp string
 * @param variant - 'date' (date only), 'datetime' (default, with time), 'detailed' (with seconds)
 */
export const formatDate = (
  timestamp: string,
  variant: DateFormatVariant = 'datetime'
): string => {
  const date = new Date(timestamp);
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };

  if (variant === 'datetime' || variant === 'detailed') {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }
  if (variant === 'detailed') {
    options.second = '2-digit';
  }

  return date.toLocaleString('en-US', options);
};

/**
 * Formats a timestamp to relative time (e.g., "5m ago", "2h ago")
 * Falls back to formatDate for timestamps older than 7 days
 */
export const formatRelativeTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(timestamp);
};

// ==================== Model Utilities ====================

/**
 * Gets the display name for a model ID from config
 */
export const getModelName = (modelId: string): string => {
  const model = DEFAULT_CONFIG.models[modelId];
  return model?.display_name || modelId;
};

// ==================== Status Colors ====================

/**
 * Returns theme-aware Tailwind classes for pass rate badges
 * Light mode: More saturated backgrounds with darker text for better visibility
 * Dark mode: Lighter text on dark backgrounds
 */
export const getPassRateColor = (passRate: number): string => {
  if (passRate >= 80) {
    // Success/Pass - Green with more saturated background
    return 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800';
  } else if (passRate >= 50) {
    // Warning - Amber with more saturated background
    return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800';
  } else {
    // Danger/Fail - Red with more saturated background
    return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
  }
};

/**
 * Returns theme-aware Tailwind classes for status indicators
 * Used for success/error/warning/info states
 * Light mode: More saturated backgrounds (100 shade) for better visibility
 * Dark mode: Semi-transparent darker backgrounds with lighter text
 */
export const getStatusColor = (status: 'success' | 'error' | 'warning' | 'info' | 'neutral'): string => {
  const colors = {
    success: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
    error: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
    warning: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
    info: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
    neutral: 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800/30 dark:text-gray-400 dark:border-gray-700',
  };
  return colors[status];
};

/**
 * Returns theme-aware text color classes for metrics
 * Used for displaying metric values in stats cards
 * Light mode: Darker colors for WCAG AA compliance (4.5:1 contrast ratio)
 * Dark mode: Lighter colors for visibility on dark backgrounds
 */
export const getMetricTextColor = (type: 'primary' | 'success' | 'error' | 'warning' | 'info' | 'secondary'): string => {
  const colors = {
    primary: 'text-blue-700 dark:text-blue-400',
    success: 'text-green-700 dark:text-green-400',
    error: 'text-red-700 dark:text-red-400',
    warning: 'text-amber-700 dark:text-amber-400',
    info: 'text-purple-700 dark:text-purple-400',
    secondary: 'text-cyan-700 dark:text-cyan-400',
  };
  return colors[type];
};

// ==================== Text Utilities ====================

/**
 * Truncates text to a specified length with ellipsis
 */
export const truncate = (text: string, length: number): string => {
  if (text.length <= length) return text;
  return text.substring(0, length).trim() + '...';
};
