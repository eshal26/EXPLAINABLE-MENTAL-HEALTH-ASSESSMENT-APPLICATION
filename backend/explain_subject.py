
import os
import json
import argparse
import warnings
import numpy as np
import torch
import torch.nn as nn
import mne
from scipy import signal as scipy_signal
from sklearn.svm import LinearSVC
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import pandas as pd

warnings.filterwarnings('ignore')

SAMPLING_RATE = 256
SEG_LENGTH    = 5 * SAMPLING_RATE
N_CHANNELS    = 19
N_CLASSES     = 2
MDD_CLASS     = 1
N_CAV_RUNS    = 20
TOP_FRACTION  = 0.30

CH = {
    'Fp1': 0,  'F3': 1,  'C3': 2,  'P3': 3,  'O1': 4,
    'F7':  5,  'T3': 6,  'T5': 7,  'Fz': 8,  'Fp2': 9,
    'F4': 10,  'C4': 11, 'P4': 12, 'O2': 13, 'F8': 14,
    'T4': 15,  'T6': 16, 'Cz': 17, 'Pz': 18,
}

CONCEPT_META = {
    'FAA': {
        'ref'          : 'Thibodeau 2006',
        'color'        : '#E24B4A',
        'desc'         : 'Frontal Alpha Asymmetry (F4 vs F3, 8–12 Hz)',
        'mdd_direction': 'positive',
        'clinical_note': 'Right hypoactivation / left hyperactivation pattern',
    },
    'Theta': {
        'ref'          : 'Olbrich & Arns 2013',
        'color'        : '#378ADD',
        'desc'         : 'Frontal Theta Power (Fz/F3/F4, 4–8 Hz)',
        'mdd_direction': 'positive',
        'clinical_note': 'Elevated frontal theta associated with rumination',
    },
    'Alpha_Power': {
        'ref'          : 'Kaiser 2015',
        'color'        : '#639922',
        'desc'         : 'Parieto-occipital Alpha (P3/P4/O1/O2, 8–12 Hz)',
        'mdd_direction': 'negative',
        'clinical_note': 'Reduced posterior alpha linked to hyperarousal',
    },
    'Beta_Power': {
        'ref'          : 'Olbrich 2015',
        'color'        : '#BA7517',
        'desc'         : 'Frontal-central Beta (F3/F4/C3/C4, 13–30 Hz)',
        'mdd_direction': 'positive',
        'clinical_note': 'Elevated beta may reflect anxious rumination',
    },
    'TBR': {
        'ref'          : 'Clarke 2013',
        'color'        : '#9C27B0',
        'desc'         : 'Theta/Beta Ratio (Fz/F3/F4)',
        'mdd_direction': 'positive',
        'clinical_note': 'Elevated TBR linked to inattention and low arousal',
    },
    'Coherence': {
        'ref'          : 'Leuchter 2012',
        'color'        : '#00897B',
        'desc'         : 'Interhemispheric Alpha Coherence (F3–F4, P3–P4, T3–T4)',
        'mdd_direction': 'positive',
        'clinical_note': 'Elevated interhemispheric alpha coherence is treated as the MDD-associated pattern',
    },
}

device = 'cuda' if torch.cuda.is_available() else 'cpu'

def welch_power(seg, channels, fmin, fmax, fs=SAMPLING_RATE):
    powers = []
    for ch in channels:
        x   = seg[:, ch].copy()
        std = x.std()
        if std > 1e-12:
            x = (x - x.mean()) / std
        f, p = scipy_signal.welch(x, fs=fs, nperseg=min(256, len(x)))
        powers.append(np.mean(p[(f >= fmin) & (f <= fmax)]))
    return float(np.mean(powers))

def score_FAA(seg):
    p_f3 = max(welch_power(seg, [CH['F3']], 8, 12), 1e-12)
    p_f4 = max(welch_power(seg, [CH['F4']], 8, 12), 1e-12)
    return float(np.log(p_f4) - np.log(p_f3))

def score_Theta(seg):
    return welch_power(seg, [CH['Fz'], CH['F3'], CH['F4']], 4, 8)

def score_Alpha_Power(seg):
    return welch_power(seg, [CH['P3'], CH['P4'], CH['O1'], CH['O2']], 8, 12)

def score_Beta_Power(seg):
    return welch_power(seg, [CH['F3'], CH['F4'], CH['C3'], CH['C4']], 13, 30)

def score_TBR(seg):
    theta = welch_power(seg, [CH['Fz'], CH['F3'], CH['F4']], 4, 8)
    beta  = max(welch_power(seg, [CH['Fz'], CH['F3'], CH['F4']], 13, 30), 1e-12)
    return float(theta / beta)

def score_Coherence(seg):
    pairs = [(CH['F3'], CH['F4']), (CH['P3'], CH['P4']), (CH['T3'], CH['T4'])]
    vals  = []
    for cl, cr in pairs:
        f, cxy = scipy_signal.coherence(
            seg[:, cl], seg[:, cr],
            fs=SAMPLING_RATE, nperseg=min(256, seg.shape[0]))
        vals.append(float(np.mean(cxy[(f >= 8) & (f <= 12)])))
    return float(np.mean(vals))

SCORE_FN = {
    'FAA'        : score_FAA,
    'Theta'      : score_Theta,
    'Alpha_Power': score_Alpha_Power,
    'Beta_Power' : score_Beta_Power,
    'TBR'        : score_TBR,
    'Coherence'  : score_Coherence,
}

_MODEL_CACHE: dict = {}

def load_model(model_path):
    if model_path in _MODEL_CACHE:
        return _MODEL_CACHE[model_path]
    from tsai.models.XceptionTimePlus import XceptionTimePlus
    model = XceptionTimePlus(c_in=N_CHANNELS, c_out=N_CLASSES, nf=32,
                             act=nn.LeakyReLU)
    try:
        state = torch.load(model_path, map_location=device, weights_only=True)
    except Exception:
        state = torch.load(model_path, map_location=device)
    model.load_state_dict(state)
    model.to(device).eval()
    _MODEL_CACHE[model_path] = model
    return model

def resolve_explanation_layer(model, cav_bank_dir=None):
    if cav_bank_dir and os.path.isdir(cav_bank_dir):
        meta_path = os.path.join(cav_bank_dir, 'cav_bank_meta.json')
        if os.path.exists(meta_path):
            try:
                with open(meta_path) as f:
                    meta = json.load(f)
                layers = meta.get('layers', [])
                if layers:
                    conv_in_meta = [n for n in layers
                                    if _is_valid_conv_layer(model, n)]
                    if conv_in_meta:
                        chosen = conv_in_meta[-1]
                        mod    = get_layer_module(model, chosen)
                        print(f"  ✓ Explanation layer (from bank meta): {chosen}  "
                              f"(Conv1d, out_channels={mod.out_channels})")
                        return chosen, 'bank_meta'
                    print(f"\n  ⚠  WARNING: no valid Conv1d in {layers}. "
                          f"Falling back to heuristic.\n")
                else:
                    print(f"\n  ⚠  WARNING: cav_bank_meta.json has no 'layers'. "
                          f"Falling back to heuristic.\n")
            except Exception as e:
                print(f"\n  ⚠  WARNING: Could not read cav_bank_meta.json ({e}). "
                      f"Falling back to heuristic.\n")
        else:
            print(f"\n  ⚠  WARNING: CAV bank dir exists but meta is missing. "
                  f"Run cav_bank.py.\n")
    return _conv1d_heuristic(model), 'conv1d_heuristic'

def _is_valid_conv_layer(model, layer_name):
    try:
        mod = get_layer_module(model, layer_name)
        return isinstance(mod, nn.Conv1d) and mod.out_channels > N_CLASSES
    except Exception:
        return False

def _conv1d_heuristic(model):
    conv_candidates = [
        name for name, mod in model.named_modules()
        if isinstance(mod, nn.Conv1d) and mod.out_channels > N_CLASSES
    ]
    if not conv_candidates:
        raise ValueError("No Conv1d layer with out_channels > N_CLASSES found.")
    chosen = conv_candidates[-1]
    mod    = get_layer_module(model, chosen)
    print(f"  ✓ Explanation layer (Conv1d heuristic): {chosen}  "
          f"(Conv1d, out_channels={mod.out_channels})")
    return chosen

def get_layer_module(model, layer_name):
    parts = layer_name.split('.')
    mod   = model
    for p in parts:
        mod = list(mod.children())[int(p)] if p.isdigit() else getattr(mod, p)
    return mod

def extract_activations(model, X, layer_name, batch_size=128):
    layer  = get_layer_module(model, layer_name)
    stored = {}

    def hook(mod, inp, out):
        act = out.detach()
        stored['act'] = (act.mean(dim=-1) if act.dim() == 3
                         else act).cpu().numpy()

    handle = layer.register_forward_hook(hook)
    acts   = []
    X_t    = torch.from_numpy(X)
    model.eval()
    with torch.no_grad():
        for i in range(0, len(X_t), batch_size):
            batch = X_t[i:i + batch_size].to(device, non_blocking=True)
            model(batch)
            acts.append(stored['act'].copy())
    handle.remove()
    return np.vstack(acts)

def train_cav(acts_pos, acts_neg):
    X = np.vstack([acts_pos, acts_neg])
    y = np.array([1] * len(acts_pos) + [0] * len(acts_neg))
    pipe = Pipeline([
        ('sc',  StandardScaler()),
        ('svm', LinearSVC(C=0.01, max_iter=5000, dual=True)),
    ])
    pipe.fit(X, y)
    acc = float(pipe.score(X, y))
    w   = pipe.named_steps['svm'].coef_[0]
    sc  = pipe.named_steps['sc'].scale_
    cav = w / (sc + 1e-10)
    cav = cav / (np.linalg.norm(cav) + 1e-10)

    pos_centroid = acts_pos.mean(axis=0)
    neg_centroid = acts_neg.mean(axis=0)
    if np.dot(cav, pos_centroid - neg_centroid) < 0:
        cav = -cav

    return cav, acc

def load_cav_bank(cav_bank_dir, layer_name):
    cav_bank = {}
    if not cav_bank_dir or not os.path.isdir(cav_bank_dir):
        print(f"  ⚠  CAV bank not found: {cav_bank_dir}")
        return cav_bank, list(SCORE_FN.keys())

    safe_layer = layer_name.replace('.', '_')
    missing    = []
    for cname in SCORE_FN:
        fpath = os.path.join(cav_bank_dir, f"{cname}_{safe_layer}.npz")
        if os.path.exists(fpath):
            data = np.load(fpath, allow_pickle=True)
            cav_bank[cname] = {
                'mean_cav': data['mean_cav'],
                'cav_accs': data['cav_accs'],
                'all_cavs': data['all_cavs'],
            }
        else:
            missing.append(cname)

    print(f"  Loaded {len(cav_bank)}/{len(SCORE_FN)} CAVs from bank "
          f"(layer={layer_name})")
    if missing:
        print(f"  ⚠  Will train on-the-fly: {missing}")
    return cav_bank, missing

def compute_dd_multi_cav(model, X, cav_matrix, layer_name, batch_size=32):
    if cav_matrix.ndim == 1:
        cav_matrix = cav_matrix[np.newaxis]

    layer = get_layer_module(model, layer_name)
    cav_t = torch.tensor(cav_matrix, dtype=torch.float32, device=device)
    cav_t = cav_t / (cav_t.norm(dim=1, keepdim=True) + 1e-10)

    X_t    = torch.from_numpy(X).to(device)
    all_dd = []
    model.eval()

    for i in range(0, len(X_t), batch_size):
        batch = X_t[i:i + batch_size]
        B     = batch.shape[0]

        leaf_store = {}

        def fwd_hook(mod, inp, out, _store=leaf_store):
            h = out.detach().requires_grad_(True)
            _store['h'] = h
            return h

        handle = layer.register_forward_hook(fwd_hook)

        try:
            with torch.enable_grad():
                logits = model(batch)
                scores = logits[:, MDD_CLASS]
                h      = leaf_store['h']

                for b in range(B):
                    grad_h = torch.autograd.grad(
                        outputs=scores[b],
                        inputs=h,
                        retain_graph=(b < B - 1),
                        create_graph=False,
                        allow_unused=False,
                    )[0]

                    grad_pooled = (grad_h[b].mean(dim=-1)
                                   if grad_h.dim() == 3 else grad_h[b])

                    assert grad_pooled.shape[0] == cav_t.shape[1], (
                        f"CAV dim {cav_t.shape[1]} != grad dim "
                        f"{grad_pooled.shape[0]}. "
                        f"Delete cav_bank/ and rebuild with cav_bank.py.")

                    dd_runs = (cav_t * grad_pooled.unsqueeze(0)).sum(dim=1)
                    all_dd.append(dd_runs.detach().cpu())

        finally:
            handle.remove()

    return torch.stack(all_dd, dim=0).T.numpy().astype(np.float32)

def load_edf(filepath):
    raw   = mne.io.read_raw_edf(filepath, preload=True, verbose=False)
    sfreq = raw.info['sfreq']
    if abs(sfreq - SAMPLING_RATE) > 1e-3:
        raise ValueError(
            f"Recording sampling rate is {sfreq:.2f} Hz; "
            f"expected {SAMPLING_RATE} Hz.")

    ch_names = raw.ch_names

    if len(ch_names) == N_CHANNELS:
        pass
    elif len(ch_names) > N_CHANNELS:
        eeg_chs = [ch for ch in ch_names if 'EEG' in ch.upper()]
        if len(eeg_chs) >= N_CHANNELS:
            raw.pick(eeg_chs[:N_CHANNELS])
            print(f"  Picked first {N_CHANNELS} 'EEG' channels "
                  f"from {len(ch_names)} total")
        else:
            raw.pick(ch_names[:N_CHANNELS])
            print(f"  Trimmed to first {N_CHANNELS} channels "
                  f"from {len(ch_names)} total")
    else:
        raise ValueError(
            f"File has only {len(ch_names)} channels; expected {N_CHANNELS}.")

    eeg        = raw.get_data().T.astype('float32')
    duration_s = eeg.shape[0] / SAMPLING_RATE
    print(f"  Loaded  : {os.path.basename(filepath)}")
    print(f"  Duration: {duration_s:.1f} s  |  Channels: {eeg.shape[1]}")
    return eeg

def segment_recording(eeg):
    segs     = [eeg[s:s + SEG_LENGTH]
                for s in range(0, eeg.shape[0] - SEG_LENGTH + 1, SEG_LENGTH)]
    segs_arr = np.array(segs)
    X        = np.transpose(segs_arr, (0, 2, 1))
    return X.astype('float32'), segs_arr

def predict(model, X, batch_size=128):
    all_probs = []
    X_t = torch.from_numpy(X)
    model.eval()
    with torch.no_grad():
        for i in range(0, len(X_t), batch_size):
            batch  = X_t[i:i + batch_size].to(device, non_blocking=True)
            logits = model(batch)
            probs  = torch.softmax(logits, dim=1).cpu().numpy()
            all_probs.append(probs)
    stacked = np.vstack(all_probs)
    return stacked, np.argmax(stacked, axis=1)

THRESHOLDS = {
    'strong_driver'  : 0.65,
    'moderate_driver': 0.55,
    'suppressor'     : 0.35,
}

def clinical_flag(tcav_val, dd_val):
    if tcav_val > THRESHOLDS['strong_driver'] and dd_val > 0:
        return 'STRONG_DRIVER'
    elif tcav_val > THRESHOLDS['moderate_driver'] and dd_val > 0:
        return 'MODERATE_DRIVER'
    elif tcav_val < THRESHOLDS['suppressor'] and dd_val < 0:
        return 'SUPPRESSOR'
    elif abs(tcav_val - 0.5) < 0.05:
        return 'NEUTRAL'
    else:
        return 'WEAK'

def make_explanation_plot(subject_name, label_str, mean_mdd_p, mean_hc_p,
                          confidence, mdd_probs, concepts,
                          concept_tcav, concept_dd_mean, segment_dd,
                          out_dir):
    concepts = [c for c in concepts if c in segment_dd]
    colors   = [CONCEPT_META[c]['color'] for c in concepts]
    n_segs   = len(mdd_probs)
    times_s  = np.arange(n_segs) * 5

    fig = plt.figure(figsize=(16, 14))
    gs  = gridspec.GridSpec(3, 2, figure=fig, hspace=0.50, wspace=0.35)
    pred_color = '#E24B4A' if label_str == 'MDD' else '#378ADD'

    ax0 = fig.add_subplot(gs[0, 0])
    ax0.barh(['HC', 'MDD'], [mean_hc_p, mean_mdd_p],
             color=['#378ADD', '#E24B4A'], alpha=0.85,
             edgecolor='white', linewidth=1.5)
    ax0.axvline(0.5, color='#888', linestyle='--', linewidth=1.2, alpha=0.8)
    ax0.set_xlim(0, 1)
    ax0.set_xlabel('Mean segment probability', fontsize=10)
    ax0.set_title(f'Prediction: {label_str}  ({confidence*100:.1f}% confidence)',
                  fontsize=12, fontweight='bold', color=pred_color)
    for spine in ['top', 'right']:
        ax0.spines[spine].set_visible(False)
    ax0.grid(axis='x', alpha=0.25)

    ax1 = fig.add_subplot(gs[0, 1])
    ax1.plot(times_s, mdd_probs, color='#E24B4A', linewidth=2.0, alpha=0.9, zorder=3)
    ax1.fill_between(times_s, mdd_probs, 0.5,
                     where=mdd_probs >= 0.5, alpha=0.18, color='#E24B4A')
    ax1.fill_between(times_s, mdd_probs, 0.5,
                     where=mdd_probs < 0.5,  alpha=0.18, color='#378ADD')
    ax1.axhline(0.5, color='#888', linestyle='--', linewidth=1.2, alpha=0.7)
    ax1.set_ylim(0, 1)
    ax1.set_xlabel('Time (s)', fontsize=10)
    ax1.set_ylabel('P(MDD)',   fontsize=10)
    ax1.set_title('MDD probability over recording', fontsize=11)
    for spine in ['top', 'right']:
        ax1.spines[spine].set_visible(False)
    ax1.grid(alpha=0.2)

    ax2       = fig.add_subplot(gs[1, 0])
    tcav_vals = [concept_tcav[c] for c in concepts]
    bars      = ax2.barh(concepts, tcav_vals, color=colors, alpha=0.85,
                         edgecolor='white', linewidth=1.2)
    ax2.axvline(0.5, color='#888', linestyle='--', linewidth=1.2, alpha=0.8,
                label='Chance (0.5)')
    ax2.axvline(THRESHOLDS['strong_driver'], color='#E24B4A',
                linestyle=':', linewidth=1.0, alpha=0.6, label='Strong (0.65)')
    ax2.axvline(THRESHOLDS['suppressor'],    color='#378ADD',
                linestyle=':', linewidth=1.0, alpha=0.6, label='Suppress (<0.35)')
    for bar, val in zip(bars, tcav_vals):
        ax2.text(min(val + 0.02, 1.05), bar.get_y() + bar.get_height() / 2,
                 f'{val*100:.1f}%', va='center', fontsize=9)
    ax2.set_xlim(0, 1.18)
    ax2.set_xlabel('TCAV score  (fraction of segments with dd > 0)', fontsize=9)
    ax2.set_title('Concept sensitivity\n(> 0.5 = drives MDD prediction)', fontsize=11)
    ax2.legend(fontsize=8, loc='lower right')
    for spine in ['top', 'right']:
        ax2.spines[spine].set_visible(False)
    ax2.grid(axis='x', alpha=0.2)

    ax3 = fig.add_subplot(gs[1, 1])
    dd_vals    = [concept_dd_mean[c] for c in concepts]
    bar_colors = ['#E24B4A' if v > 0 else '#378ADD' for v in dd_vals]
    ax3.barh(concepts, dd_vals, color=bar_colors, alpha=0.85,
             edgecolor='white', linewidth=1.2)
    ax3.axvline(0, color='#888', linestyle='--', linewidth=1.2, alpha=0.7)
    ax3.set_xlabel('Mean directional derivative', fontsize=9)
    ax3.set_title('Concept direction\n(red = toward MDD, blue = away)', fontsize=11)
    for spine in ['top', 'right']:
        ax3.spines[spine].set_visible(False)
    ax3.grid(axis='x', alpha=0.2)

    ax4 = fig.add_subplot(gs[2, :])
    dd_matrix = np.array([segment_dd[c] for c in concepts])
    row_max   = np.abs(dd_matrix).max(axis=1, keepdims=True)
    row_max[row_max == 0] = 1.0
    dd_norm   = dd_matrix / row_max

    im = ax4.imshow(
        dd_norm, aspect='auto', cmap='RdBu_r', vmin=-1, vmax=1,
        extent=[times_s[0] - 2.5, times_s[-1] + 2.5, -0.5, len(concepts) - 0.5])
    ax4.set_yticks(range(len(concepts)))
    ax4.set_yticklabels(concepts, fontsize=9)
    ax4.set_xlabel('Time (s)', fontsize=10)
    ax4.set_title('Concept sensitivity over time  '
                  '(red = drives MDD, blue = suppresses)', fontsize=11)
    plt.colorbar(im, ax=ax4, label='Normalised directional derivative',
                 shrink=0.55, pad=0.01)

    ax4b = ax4.twinx()
    ax4b.plot(times_s, mdd_probs, color='white', linewidth=1.2,
              alpha=0.7, linestyle='--', label='P(MDD)')
    ax4b.set_ylim(0, 1)
    ax4b.set_ylabel('P(MDD)', fontsize=8, color='white')
    ax4b.tick_params(axis='y', colors='white', labelsize=8)
    ax4b.legend(fontsize=8, loc='upper right',
                facecolor='#222', edgecolor='#555', labelcolor='white')

    fig.suptitle(
        f'EEG Concept Explanation — {subject_name}\n'
        f'Prediction: {label_str}  │  '
        f'P(MDD)={mean_mdd_p*100:.1f}%  P(HC)={mean_hc_p*100:.1f}%  │  '
        f'Confidence: {confidence*100:.1f}%',
        fontsize=13, fontweight='bold', y=1.01)

    plot_path = os.path.join(out_dir, f'{subject_name}_explanation.png')
    plt.savefig(plot_path, dpi=200, bbox_inches='tight',
                facecolor='white', edgecolor='none')
    plt.close()
    print(f"  Saved: {plot_path}")
    return plot_path

_SANITY_PASSED = set()

def sanity_check_gradients(model, model_path, layer_name,
                            n_channels=N_CHANNELS, seg_len=SEG_LENGTH):
    key = (model_path, layer_name)
    if key in _SANITY_PASSED:
        print(f"  [sanity] ✓ Already verified — skipping.")
        return True

    print(f"  [sanity] Checking gradients at: {layer_name}")
    layer = get_layer_module(model, layer_name)
    model.eval()
    grad_vecs = []

    for seed in (0, 1):
        rng   = np.random.default_rng(seed)
        dummy = rng.standard_normal((1, n_channels, seg_len)).astype('float32')
        store = {}

        def hook(mod, inp, out, _s=store):
            h = out.detach().requires_grad_(True)
            _s['h'] = h
            return h

        handle = layer.register_forward_hook(hook)
        batch  = torch.from_numpy(dummy).to(device)
        try:
            with torch.enable_grad():
                logits = model(batch)
                score  = logits[0, MDD_CLASS]
                grad_h = torch.autograd.grad(score, store['h'],
                                             retain_graph=False,
                                             allow_unused=False)[0]
        finally:
            handle.remove()

        g = (grad_h[0].mean(dim=-1) if grad_h.dim() == 3 else grad_h[0])
        g = g.detach().cpu().numpy().ravel()
        grad_vecs.append(g)
        print(f"    seed={seed}  grad_norm={np.linalg.norm(g):.6f}")

    if any(np.linalg.norm(g) < 1e-9 for g in grad_vecs):
        print("  [sanity] ⚠  ZERO GRADIENTS — wrong layer.")
        return False

    diff = np.linalg.norm(grad_vecs[0] - grad_vecs[1])
    print(f"    gradient difference between inputs: {diff:.6f}")
    if diff < 1e-9:
        print("  [sanity] ⚠  CONSTANT GRADIENTS — layer insensitive to input.")
        return False

    print("  [sanity] ✓ Gradients are non-zero and input-dependent.")
    _SANITY_PASSED.add(key)
    return True

def explain_subject(edf_path, model_path, npz_path, out_dir,
                    cav_bank_dir=None, n_cav_runs=N_CAV_RUNS):
    subject_name = os.path.splitext(os.path.basename(edf_path))[0]
    subject_out  = os.path.join(out_dir, subject_name)
    os.makedirs(subject_out, exist_ok=True)

    print("=" * 65)
    print(f"SUBJECT EXPLANATION  —  {subject_name}")
    print("=" * 65)

    print("\n[1] Loading EDF recording...")
    eeg         = load_edf(edf_path)
    X, segs_raw = segment_recording(eeg)
    n_segs      = len(X)
    print(f"  Segments (5 s, non-overlapping): {n_segs}")
    if n_segs < 3:
        raise ValueError(f"Only {n_segs} segments. Need ≥ 15 s.")

    print("\n[2] Loading model...")
    model = load_model(model_path)
    best_layer, layer_source = resolve_explanation_layer(model, cav_bank_dir)

    ok = sanity_check_gradients(model, model_path, best_layer)
    if not ok:
        all_conv = [name for name, mod in model.named_modules()
                    if isinstance(mod, nn.Conv1d) and mod.out_channels > N_CLASSES]
        for candidate in reversed(all_conv):
            if candidate == best_layer:
                continue
            ok = sanity_check_gradients(model, model_path, candidate)
            if ok:
                print(f"  ⚠  Falling back to: {candidate}")
                best_layer   = candidate
                layer_source = 'sanity_fallback'
                break
        else:
            raise RuntimeError("No Conv1d layer produced valid gradients.")

    print(f"  Layer source: {layer_source}")

    print("\n[3] Running prediction...")
    probs, _   = predict(model, X)
    mdd_probs  = probs[:, MDD_CLASS]
    hc_probs   = probs[:, 1 - MDD_CLASS]
    mean_mdd_p = float(np.mean(mdd_probs))
    mean_hc_p  = float(np.mean(hc_probs))
    pred_label = 'MDD' if mean_mdd_p >= 0.5 else 'HC'
    confidence = max(mean_mdd_p, mean_hc_p)

    print(f"\n  ┌──────────────────────────────────────┐")
    print(f"  │  Prediction  : {pred_label:<21}  │")
    print(f"  │  P(MDD)      : {mean_mdd_p*100:5.1f}%                  │")
    print(f"  │  P(HC)       : {mean_hc_p*100:5.1f}%                  │")
    print(f"  │  Confidence  : {confidence*100:5.1f}%                  │")
    print(f"  │  Segments    : {n_segs:<21}  │")
    print(f"  └──────────────────────────────────────┘")

    print("\n[4] Loading CAVs...")
    cav_bank, missing_concepts = load_cav_bank(cav_bank_dir or '', best_layer)

    pool_acts         = None
    pool_scores_cache = {}

    if missing_concepts:
        print("\n  Loading training pool for on-the-fly CAV training...")
        npz        = np.load(npz_path, allow_pickle=True)
        X_pool     = npz['X_train'].astype('float32')
        X_pool_tc  = np.transpose(X_pool, (0, 2, 1))
        y_pool     = npz['y_train']
        print(f"  Pool: {len(X_pool)} segments  "
              f"(MDD={np.sum(y_pool==1)}, HC={np.sum(y_pool==0)})")

        for cname in missing_concepts:
            scores = []
            for seg in X_pool_tc:
                try:
                    scores.append(SCORE_FN[cname](seg))
                except Exception:
                    scores.append(0.0)
            pool_scores_cache[cname] = np.array(scores)

        print(f"  Extracting pool activations at {best_layer}...")
        pool_acts = extract_activations(model, X_pool, best_layer, batch_size=128)
        print(f"  Pool activations: {pool_acts.shape}")

    print("\n[5] Computing concept directional derivatives...")
    concepts        = list(SCORE_FN.keys())
    concept_tcav    = {}
    concept_dd_mean = {}
    concept_dd_std  = {}
    segment_dd      = {}
    cav_accuracies  = {}

    for cname in concepts:
        print(f"\n  Concept: {cname}", end='', flush=True)

        if cname in cav_bank:
            all_cavs = cav_bank[cname]['all_cavs']
            accs     = cav_bank[cname]['cav_accs']
            mean_acc = float(np.mean(accs))
            print(f"  [bank]  {len(all_cavs)} runs  acc={mean_acc*100:.1f}%",
                  end='', flush=True)

        else:
            scores  = pool_scores_cache[cname]
            k       = max(2, int(TOP_FRACTION * len(scores)))
            pos_idx = np.argsort(scores)[-k:]
            neg_idx = np.argsort(scores)[:k]

            cav_vecs      = []
            cav_accs_list = []
            for run in range(n_cav_runs):
                rng    = np.random.default_rng(run * 7 + 42)
                n_draw = min(k, len(pos_idx))
                p_pick = rng.choice(pos_idx, n_draw, replace=False)
                n_pick = rng.choice(neg_idx, n_draw, replace=False)
                try:
                    cav_v, acc = train_cav(pool_acts[p_pick], pool_acts[n_pick])
                    cav_vecs.append(cav_v)
                    cav_accs_list.append(acc)
                except Exception as e:
                    print(f" [run {run} failed: {e}]", end='')

            if not cav_vecs:
                print(f"  ALL RUNS FAILED — skipping")
                continue

            all_cavs = np.stack(cav_vecs, axis=0)
            mean_acc = float(np.mean(cav_accs_list))
            print(f"  [on-the-fly]  {len(all_cavs)} runs  acc={mean_acc*100:.1f}%",
                  end='', flush=True)

        dd_all = compute_dd_multi_cav(model, X, all_cavs, best_layer)

        run_mean_dds    = dd_all.mean(axis=1)           # (R,) mean DD per run
        run_segment_pos = (dd_all > 0).mean(axis=1)    # (R,) TCAV per run
        tcav_score      = float(np.mean(run_segment_pos))

        dd_per_segment = dd_all.mean(axis=0)            # (N,)

        concept_tcav[cname]    = tcav_score
        concept_dd_mean[cname] = float(np.mean(run_mean_dds))
        concept_dd_std[cname]  = float(np.std(run_mean_dds))
        segment_dd[cname]      = dd_per_segment
        cav_accuracies[cname]  = mean_acc

        flag = clinical_flag(tcav_score, concept_dd_mean[cname])
        print(f"  TCAV={tcav_score*100:.1f}%  "
              f"mean_dd={concept_dd_mean[cname]:+.4f}  "
              f"std_dd={concept_dd_std[cname]:.4f}  [{flag}]")

    print("\n[6] Generating explanation plot...")
    plot_path = make_explanation_plot(
        subject_name, pred_label, mean_mdd_p, mean_hc_p, confidence,
        mdd_probs, concepts, concept_tcav, concept_dd_mean, segment_dd,
        subject_out)

    print("\n[7] Saving outputs...")
    seg_rows = []
    for seg_idx in range(n_segs):
        row = {
            'subject'    : subject_name,
            'segment_idx': seg_idx,
            'time_s'     : seg_idx * 5,
            'mdd_prob'   : round(float(mdd_probs[seg_idx]), 5),
            'hc_prob'    : round(float(hc_probs[seg_idx]),  5),
            'prediction' : pred_label,
        }
        for cname in concepts:
            if cname in segment_dd:
                row[f'dd_{cname}']     = round(float(segment_dd[cname][seg_idx]), 6)
                row[f'dd_pos_{cname}'] = bool(segment_dd[cname][seg_idx] > 0)
        seg_rows.append(row)

    seg_df  = pd.DataFrame(seg_rows)
    seg_csv = os.path.join(subject_out, f'{subject_name}_segment_scores.csv')
    seg_df.to_csv(seg_csv, index=False)
    print(f"  Saved: {seg_csv}")

    summary_rows    = []
    sorted_concepts = sorted(
        [c for c in concepts if c in concept_tcav],
        key=lambda c: abs(concept_tcav[c] - 0.5), reverse=True)

    for c in sorted_concepts:
        tcav_val = concept_tcav[c]
        dd_val   = concept_dd_mean[c]
        flag     = clinical_flag(tcav_val, dd_val)
        meta     = CONCEPT_META[c]
        summary_rows.append({
            'subject'      : subject_name,
            'prediction'   : pred_label,
            'mdd_prob'     : round(mean_mdd_p,  5),
            'hc_prob'      : round(mean_hc_p,   5),
            'confidence'   : round(confidence,  5),
            'n_segments'   : n_segs,
            'concept'      : c,
            'tcav_score'   : round(tcav_val,    5),
            'mean_dd'      : round(dd_val,       6),
            'std_dd'       : round(concept_dd_std.get(c, 0.0), 6),
            'cav_accuracy' : round(cav_accuracies.get(c, 0.0), 5),
            'clinical_flag': flag,
            'mdd_direction': meta['mdd_direction'],
            'reference'    : meta['ref'],
            'description'  : meta['desc'],
            'clinical_note': meta['clinical_note'],
            'layer_used'   : best_layer,
            'layer_source' : layer_source,
        })

    summary_df  = pd.DataFrame(summary_rows)
    summary_csv = os.path.join(subject_out, f'{subject_name}_subject_summary.csv')
    summary_df.to_csv(summary_csv, index=False)
    print(f"  Saved: {summary_csv}")

    def _safe_float(val, digits):
        if val is None:
            return None
        try:
            v = float(val)
            return None if (v != v) else round(v, digits)
        except (TypeError, ValueError):
            return None

    report = {
        'subject'          : subject_name,
        'edf_path'         : edf_path,
        'prediction'       : pred_label,
        'mdd_prob'         : _safe_float(mean_mdd_p,  5),
        'hc_prob'          : _safe_float(mean_hc_p,   5),
        'confidence'       : _safe_float(confidence,  5),
        'n_segments'       : n_segs,
        'recording_s'      : n_segs * 5,
        'layer_used'       : best_layer,
        'layer_source'     : layer_source,
        'cav_bank_used'    : (cav_bank_dir is not None
                              and os.path.isdir(str(cav_bank_dir))),
        'segment_mdd_probs': mdd_probs.tolist(),
        'concepts': {
            c: {
                'tcav_score'   : _safe_float(concept_tcav.get(c),        5),
                'mean_dd'      : _safe_float(concept_dd_mean.get(c),     6),
                'std_dd'       : _safe_float(concept_dd_std.get(c, 0.0), 6),
                'cav_accuracy' : _safe_float(cav_accuracies.get(c),      5),
                'clinical_flag': clinical_flag(
                    concept_tcav.get(c,    0.5),
                    concept_dd_mean.get(c, 0.0)),
                'segment_dd'   : (segment_dd[c].tolist()
                                  if c in segment_dd else []),
                'description'  : CONCEPT_META[c]['desc'],
                'reference'    : CONCEPT_META[c]['ref'],
                'clinical_note': CONCEPT_META[c]['clinical_note'],
                'mdd_direction': CONCEPT_META[c]['mdd_direction'],
            }
            for c in concepts
        },
        'output_files': {
            'plot'       : plot_path,
            'segment_csv': seg_csv,
            'summary_csv': summary_csv,
        },
    }

    json_path = os.path.join(subject_out, f'{subject_name}_report_data.json')
    with open(json_path, 'w') as f:
        json.dump(report, f, indent=2)
    print(f"  Saved: {json_path}")

    print("\n" + "=" * 65)
    print(f"CLINICAL SUMMARY  —  {subject_name}")
    print("=" * 65)
    print(f"\n  Prediction  : {pred_label}")
    print(f"  P(MDD)      : {mean_mdd_p*100:.1f}%")
    print(f"  P(HC)       : {mean_hc_p*100:.1f}%")
    print(f"  Confidence  : {confidence*100:.1f}%")
    print(f"  Recording   : {n_segs * 5} s  ({n_segs} × 5 s segments)")
    print(f"  Layer       : {best_layer}  [{layer_source}]")
    print()
    print(f"  {'Concept':<20} {'TCAV%':>7} {'Mean DD':>10} {'CAV acc':>8}  Flag")
    print("  " + "─" * 62)

    flag_icons = {
        'STRONG_DRIVER'  : '★★★',
        'MODERATE_DRIVER': '★★ ',
        'SUPPRESSOR'     : '▼  ',
        'NEUTRAL'        : '── ',
        'WEAK'           : '·  ',
    }
    for row in summary_rows:
        c    = row['concept']
        flag = row['clinical_flag']
        icon = flag_icons.get(flag, '   ')
        print(f"  {c:<20} {row['tcav_score']*100:>6.1f}% "
              f"{row['mean_dd']:>+10.4f} "
              f"{row['cav_accuracy']*100:>7.1f}%  "
              f"{icon} {flag}")

    print()
    print("  ★★★ STRONG_DRIVER   → TCAV > 65%: concept consistently drives prediction")
    print("  ★★  MODERATE_DRIVER → TCAV 55–65%: moderate influence")
    print("  ▼   SUPPRESSOR      → TCAV < 35%: concept opposes prediction")
    print("  ──  NEUTRAL         → TCAV ≈ 50%: no meaningful influence")
    print("=" * 65)
    print(f"\nReport data saved to: {subject_out}/")
    return report

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Per-subject EEG concept explanation using TCAV")
    parser.add_argument('--edf',      required=True)
    parser.add_argument('--model',    default='xceptiontime_mdd_v2_statedict.pt')
    parser.add_argument('--npz',      default='eeg_preprocessed.npz')
    parser.add_argument('--cav_bank', default='./cav_bank')
    parser.add_argument('--out',      default='./explanation_results')
    parser.add_argument('--cav_runs', type=int, default=N_CAV_RUNS)
    args = parser.parse_args()

    result = explain_subject(
        edf_path     = args.edf,
        model_path   = args.model,
        npz_path     = args.npz,
        out_dir      = args.out,
        cav_bank_dir = args.cav_bank,
        n_cav_runs   = args.cav_runs,
    )
