import sys
import re

def check_brackets(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        text = f.read()

    # We only care about parentheses and braces for TS1005: ')' expected
    brackets = {'{': '}', '(': ')'}
    reverse_brackets = {v: k for k, v in brackets.items()}
    stack = []

    # Strip single line comments and strings using a regex for a rough approximation, 
    # but a simple stack is enough if we are careful.
    
    # Just a simple count might suffice for a quick check.
    # Let's count them:
    open_paren = text.count('(')
    close_paren = text.count(')')
    open_brace = text.count('{')
    close_brace = text.count('}')
    open_bracket = text.count('[')
    close_bracket = text.count(']')
    
    print(f"Parentheses: {open_paren} ( vs {close_paren} )")
    print(f"Braces: {open_brace} {{ vs {close_brace} }}")
    print(f"Brackets: {open_bracket} [ vs {close_bracket} ]")

check_brackets('src/components/lead-capture/lead-capture-client.tsx')
