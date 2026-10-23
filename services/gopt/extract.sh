#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C
assets="$GOPT_ASSETS"
root="$KALDI_ROOT"
ln -s "$root/egs/wsj/s5/steps" steps
ln -s "$root/egs/wsj/s5/utils" utils
mkdir bin
cat > bin/ivector-extract-online2 <<'EOF'
#!/usr/bin/env bash
exec "$KALDI_ROOT/src/online2bin/ivector-extract-online2" --num-threads=1 "$@"
EOF
chmod +x bin/ivector-extract-online2
cat > path.sh <<EOF
export KALDI_ROOT=$root
. \$KALDI_ROOT/tools/config/common_path.sh
export PATH=\$PWD/bin:\$PWD/utils:\$PATH
export LC_ALL=C
EOF
. ./path.sh
steps/make_mfcc.sh --nj 1 --cmd run.pl --mfcc-config /app/mfcc.conf data logs/mfcc mfcc
steps/compute_cmvn_stats.sh data logs/cmvn mfcc
steps/online/nnet2/extract_ivectors_online.sh --nj 1 --cmd run.pl \
    data "$assets/extractor" ivectors
steps/nnet3/compute_output.sh --nj 1 --cmd run.pl --use-gpu false \
    --online-ivector-dir ivectors data "$assets/acoustic" probs
compile-train-graphs-without-lexicon --read-disambig-syms="$assets/lang/phones/disambig.int" \
    "$assets/acoustic/tree" "$assets/acoustic/final.mdl" \
    ark,t:text.int ark,t:text-phone.int ark:graphs.ark
align-compiled-mapped --transition-scale=1.0 --acoustic-scale=0.1 --self-loop-scale=0.1 \
    --beam=10 --retry-beam=40 "$assets/acoustic/final.mdl" ark:graphs.ark \
    ark:probs/output.1.ark ark:ali.ark
ali-to-phones --per-frame=true "$assets/acoustic/final.mdl" ark:ali.ark ark:ali-phone.ark
compute-gop --phone-map=phone-map.int --skip-phones-string=0:1:2 \
    "$assets/acoustic/final.mdl" ark:ali.ark ark:ali-phone.ark \
    ark:probs/output.1.ark ark:gop.ark ark:features.ark
