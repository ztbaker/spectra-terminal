"""Screener DSL — recursive-descent parser for declarative stock queries.

Grammar:
    query     = or_expr
    or_expr   = and_expr (OR and_expr)*
    and_expr  = primary (AND primary)*
    primary   = '(' or_expr ')'
              | comparison
    comparison = field operator value
    field     = IDENTIFIER
    operator  = '<' | '>' | '<=' | '>=' | '=' | '!='
    value     = NUMBER | QUOTED_STRING | IDENTIFIER

Examples:
    pe<15 AND mktcap>10b AND sector="Energy"
    pe<15 AND (sector="Energy" OR sector="Materials")
    beta>1.5 AND divyield>3

Unit suffixes: b/B=billion, m/M=million, k/K=thousand, %=percent/100
"""

import re
from dataclasses import dataclass
from typing import Any

TOKEN_SPEC = [
    ("STRING", r'"[^"]*"'),
    ("NUMBER", r"\d+\.?\d*"),
    ("LTE",    r"<="),
    ("GTE",    r">="),
    ("NEQ",    r"!="),
    ("LT",     r"<"),
    ("GT",     r">"),
    ("EQ",     r"="),
    ("LPAREN", r"\("),
    ("RPAREN", r"\)"),
    ("AND",    r"\bAND\b"),
    ("OR",     r"\bOR\b"),
    ("IDENT",  r"[A-Za-z_][A-Za-z0-9_]*"),
    ("SKIP",   r"\s+"),
]

_TOKEN_RE = re.compile("|".join(f"(?P<{name}>{pattern})" for name, pattern in TOKEN_SPEC))

FIELD_MAP = {
    "pe": "pe_ratio",
    "mktcap": "market_cap",
    "marketcap": "market_cap",
    "volume": "volume",
    "avgvol": "avg_volume",
    "beta": "beta",
    "divyield": "dividend_yield",
    "sector": "sector",
    "industry": "industry",
    "price": "price",
    "change": "change_pct",
    "52high": "high_52w",
    "52low": "low_52w",
    "eps": "eps",
}


@dataclass
class Token:
    type: str
    value: str


def tokenize(text: str) -> list[Token]:
    tokens = []
    for m in _TOKEN_RE.finditer(text):
        kind = m.lastgroup
        value = m.group()
        if kind == "SKIP":
            continue
        if kind == "STRING":
            value = value[1:-1]
        tokens.append(Token(kind, value))
    return tokens


@dataclass
class Comparison:
    field: str
    operator: str
    value: Any


@dataclass
class AndExpr:
    children: list


@dataclass
class OrExpr:
    children: list


def _parse_value(value_str: str) -> Any:
    lower = value_str.lower()
    multiplier = 1
    if lower.endswith("b"):
        multiplier = 1_000_000_000
        value_str = value_str[:-1]
    elif lower.endswith("m"):
        multiplier = 1_000_000
        value_str = value_str[:-1]
    elif lower.endswith("k"):
        multiplier = 1_000
        value_str = value_str[:-1]
    elif lower.endswith("%"):
        multiplier = 0.01
        value_str = value_str[:-1]

    try:
        return float(value_str) * multiplier
    except ValueError:
        return value_str


class _Parser:
    def __init__(self, tokens: list[Token]):
        self.tokens = tokens
        self.pos = 0

    def _peek(self) -> Token | None:
        if self.pos < len(self.tokens):
            return self.tokens[self.pos]
        return None

    def _consume(self, expected_type: str | None = None) -> Token:
        tok = self._peek()
        if tok is None:
            raise SyntaxError(f"Unexpected end of input, expected {expected_type}")
        if expected_type and tok.type != expected_type:
            raise SyntaxError(f"Expected {expected_type}, got {tok.type}({tok.value})")
        self.pos += 1
        return tok

    def parse(self):
        result = self._or_expr()
        if self.pos < len(self.tokens):
            raise SyntaxError(f"Unexpected token: {self.tokens[self.pos].value}")
        return result

    def _or_expr(self):
        children = [self._and_expr()]
        while self._peek() and self._peek().type == "OR":
            self._consume("OR")
            children.append(self._and_expr())
        return OrExpr(children) if len(children) > 1 else children[0]

    def _and_expr(self):
        children = [self._primary()]
        while self._peek() and self._peek().type == "AND":
            self._consume("AND")
            children.append(self._primary())
        return AndExpr(children) if len(children) > 1 else children[0]

    def _primary(self):
        tok = self._peek()
        if tok and tok.type == "LPAREN":
            self._consume("LPAREN")
            expr = self._or_expr()
            self._consume("RPAREN")
            return expr
        return self._comparison()

    def _comparison(self):
        field_tok = self._consume("IDENT")
        field = FIELD_MAP.get(field_tok.value.lower(), field_tok.value.lower())

        op_tok = self._peek()
        if op_tok and op_tok.type in ("LT", "GT", "LTE", "GTE", "EQ", "NEQ"):
            op = self._consume().value
        else:
            raise SyntaxError(f"Expected operator, got {op_tok}")

        val_tok = self._peek()
        if val_tok and val_tok.type == "NUMBER":
            raw_val = self._consume("NUMBER").value
        elif val_tok and val_tok.type == "STRING":
            raw_val = self._consume("STRING").value
        elif val_tok and val_tok.type == "IDENT":
            raw_val = self._consume("IDENT").value
        else:
            raise SyntaxError(f"Expected value, got {val_tok}")

        value = _parse_value(raw_val) if val_tok and val_tok.type == "NUMBER" else raw_val

        return Comparison(field=field, operator=op, value=value)


def parse_query(text: str):
    tokens = tokenize(text)
    if not tokens:
        return None
    return _Parser(tokens).parse()


def evaluate(node, row: dict) -> bool:
    if isinstance(node, Comparison):
        field_val = row.get(node.field)
        if field_val is None:
            return False
        cmp_val = node.value
        if isinstance(field_val, str):
            cmp_val = str(cmp_val).lower()
            field_val = field_val.lower()
        try:
            if node.operator == "<":  return field_val < cmp_val
            if node.operator == ">":  return field_val > cmp_val
            if node.operator == "<=": return field_val <= cmp_val
            if node.operator == ">=": return field_val >= cmp_val
            if node.operator == "=":  return field_val == cmp_val
            if node.operator == "!=": return field_val != cmp_val
        except TypeError:
            return False
        return False

    if isinstance(node, AndExpr):
        return all(evaluate(child, row) for child in node.children)

    if isinstance(node, OrExpr):
        return any(evaluate(child, row) for child in node.children)

    return False