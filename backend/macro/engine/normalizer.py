"""Percentile rank normalization over rolling windows."""


class Normalizer:
    @staticmethod
    def percentile_rank(current_value: float, history: list[float], window_days: int = 504) -> float:
        """
        Compute the percentile rank of current_value within the last window_days of history.
        Returns 0-100. If history has fewer than 30 values, returns 50.0 (neutral).
        """
        window = history[-window_days:] if len(history) > window_days else history
        if len(window) < 30:
            return 50.0
        count_below = sum(1 for v in window if v < current_value)
        return (count_below / len(window)) * 100.0

    @staticmethod
    def zscore(current_value: float, history: list[float], window_days: int = 504) -> float:
        """
        Compute z-score of current_value vs trailing history.
        Used as secondary normalization for series with non-uniform distributions.
        """
        window = history[-window_days:] if len(history) > window_days else history
        if len(window) < 30:
            return 0.0
        mean = sum(window) / len(window)
        variance = sum((x - mean) ** 2 for x in window) / len(window)
        std = variance ** 0.5
        if std < 1e-10:
            return 0.0
        return (current_value - mean) / std