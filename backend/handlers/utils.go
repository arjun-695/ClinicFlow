package handlers

import (
	"strings"
	"unicode"
)

// CapitalizeName formats a name string so that the first letter of both surname and last name (each word) is capitalized.
func CapitalizeName(name string) string {
	words := strings.Fields(name)
	for i, word := range words {
		runes := []rune(strings.ToLower(word))
		if len(runes) > 0 {
			runes[0] = unicode.ToUpper(runes[0])
		}
		words[i] = string(runes)
	}
	return strings.Join(words, " ")
}
