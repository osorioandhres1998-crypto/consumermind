"""Pruebas del enlace Audience Research (JTBD) → arquetipos → personas (Fase 2.3)."""

from app.llm.audience_research import HeuristicAudienceResearcher
from app.llm.config_builder import build_simulation_plan
from app.llm.personas import HeuristicPersonaPanel, _build_prompt
from app.llm.profiles import ClaudeProfileGenerator, HeuristicProfileGenerator, jtbd_link


def _segments():
    return HeuristicAudienceResearcher().research("Una app de finanzas para freelancers", "freelancers")["segments"]


def test_jtbd_link_keeps_only_known_fields():
    link = jtbd_link({"segment": "S", "main_pain": "p", "trigger_situation": "t", "otro": "x"})
    assert link["jtbd_segment"] == "S"
    assert link["jtbd"] == {"main_pain": "p", "trigger_situation": "t"}


def test_heuristic_profiles_one_per_segment_with_link():
    segs = _segments()
    arch = HeuristicProfileGenerator().generate_profiles("idea", "aud", 8, segs)
    assert len(arch) == len(segs)  # ignora n_profiles=8
    assert [a["name"] for a in arch] == [s["segment"] for s in segs]
    assert all(a["jtbd_segment"] == s["segment"] for a, s in zip(arch, segs, strict=True))
    assert all(a["jtbd"]["main_pain"] == s["main_pain"] for a, s in zip(arch, segs, strict=True))
    assert abs(sum(a["segment_share"] for a in arch) - 1.0) < 0.01
    # Sin segmentos, comportamiento anterior intacto.
    assert len(HeuristicProfileGenerator().generate_profiles("idea", "aud", 5)) == 5


def test_claude_profiles_link_by_position_and_fallback():
    segs = _segments()[:2]

    class Fake:
        def complete_json(self, system, prompt, **kw):
            assert "EXACTAMENTE 2 arquetipos" in prompt and segs[0]["segment"] in prompt
            return {"archetypes": [
                {"name": "A", "segment_share": 0.6, "price_sensitivity": 1.0, "adoption_prob_base": 0.3, "feature_weights": {}, "key_drivers": []},
                {"name": "B", "segment_share": 0.4, "price_sensitivity": 2.0, "adoption_prob_base": 0.1, "feature_weights": {}, "key_drivers": []},
                {"name": "sobrante", "segment_share": 0.1},
            ]}

    arch = ClaudeProfileGenerator(client=Fake()).generate_profiles("idea", "aud", 8, segs)
    assert [a["name"] for a in arch] == ["A", "B"]  # el sobrante se descarta
    assert arch[1]["jtbd_segment"] == segs[1]["segment"]

    class Broken:
        def complete_json(self, *a, **k):
            raise RuntimeError("x")

    fb = ClaudeProfileGenerator(client=Broken()).generate_profiles("idea", "aud", 8, segs)
    assert len(fb) == 2 and fb[0]["jtbd_segment"] == segs[0]["segment"]


def test_plan_uses_segments_and_personas_prompt_carries_jtbd():
    segs = _segments()
    plan = build_simulation_plan("idea de producto", "audiencia", n_archetypes=8, segments=segs)
    assert len(plan["archetypes"]) == len(segs)
    prompt = _build_prompt("idea", "aud", plan["archetypes"], None, None, None)
    assert "JTBD →" in prompt and segs[0]["main_pain"] in prompt
    # El panel heurístico sigue funcionando con arquetipos enlazados.
    panel = HeuristicPersonaPanel().respond("idea", "aud", plan["archetypes"])
    assert [r["persona"] for r in panel["responses"]] == [s["segment"] for s in segs]
