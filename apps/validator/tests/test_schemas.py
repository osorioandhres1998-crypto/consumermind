"""Pruebas unitarias de los modelos pydantic."""

import pytest
from pydantic import ValidationError

from app.models.schemas import NoiseDistribution, SimulationConfig


def test_config_defaults_match_documentation():
    cfg = SimulationConfig()
    assert cfg.n_iterations == 10000
    assert cfg.population_size == 1000
    assert cfg.random_seed == 42
    assert cfg.feature_weights  # no vacío


def test_config_rejects_non_positive_iterations():
    with pytest.raises(ValidationError):
        SimulationConfig(n_iterations=0)


def test_config_rejects_adoption_prob_out_of_range():
    with pytest.raises(ValidationError):
        SimulationConfig(adoption_prob_base=1.5)


def test_config_rejects_empty_feature_weights():
    with pytest.raises(ValidationError):
        SimulationConfig(feature_weights={})


def test_noise_distribution_defaults():
    noise = NoiseDistribution()
    assert noise.type == "normal"
    assert noise.params["scale"] == 1.0


def test_noise_distribution_rejects_unknown_type():
    with pytest.raises(ValidationError):
        NoiseDistribution(type="cauchy")


def test_to_engine_config_is_plain_dict():
    cfg = SimulationConfig(n_iterations=10)
    engine = cfg.to_engine_config()
    assert isinstance(engine, dict)
    assert engine["n_iterations"] == 10
    assert isinstance(engine["noise_distribution"], dict)
