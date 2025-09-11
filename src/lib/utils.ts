export const pad = (n: string | number, amount = 2) => {
    if (amount === 2) {
        return ('0' + n).slice(-2);
    } else {
        return ('00' + n).slice(-3);
    }
};
