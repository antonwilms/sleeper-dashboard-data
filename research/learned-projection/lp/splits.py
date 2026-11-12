"""Splits (task §5.2): test seasons T = 2019..2025, train = seasons < T (features from 2014; 2012-2013 history only)."""
TEST_SEASONS = tuple(range(2019, 2026))
DEV_FOLDS = tuple(range(2019, 2025))
CONFIRM_FOLD = 2025
FIRST_TRAIN_SEASON = 2014
INNER_ALPHAS = (0.1, 1.0, 10.0, 100.0)


def train_seasons(T):
    return tuple(range(FIRST_TRAIN_SEASON, T))


def inner_split(T):
    """Inner selection: fit on training seasons <= T-3, validate on its last two training seasons (T-2, T-1)."""
    return tuple(range(FIRST_TRAIN_SEASON, T - 2)), (T - 2, T - 1)


def assert_train_only(df, T, col="S"):
    """Hygiene (T-PY-7): no training row has S >= T."""
    bad = df[df[col] >= T]
    if len(bad):
        raise AssertionError("split leakage: %d training rows with %s >= %d" % (len(bad), col, T))
    return df
