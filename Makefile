.PHONY: install start start-dev stop test verify

install:
	pip install -r requirements.txt

start:
	uvicorn app.main:app --host 0.0.0.0 --port 8000

start-dev:
	uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

stop:
	@pkill -f "uvicorn app.main:app" || true

test:
	pytest tests/ -v

verify:
	python3 scripts/verify_completions.py
	python3 scripts/verify_anthropic.py
