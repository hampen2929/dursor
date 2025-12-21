# Makefile - convenience git helpers

.PHONY: pull
pull:
	@git pull --rebase || git pull
